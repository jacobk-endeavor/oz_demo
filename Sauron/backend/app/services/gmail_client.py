from __future__ import annotations

import asyncio
import base64
import os
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.utils import parsedate_to_datetime
from typing import Any

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

if settings.gmail_oauth_redirect_uri.startswith("http://localhost"):
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from app.models.gmail_credential import GmailCredential
from app.schemas.gmail import (
    GmailMessageListResponse,
    GmailMessageRead,
    GmailSendResponse,
)

USER_CONNECTION_KEY_PREFIX = "user:"


def connection_key_for_user(user_id: int) -> str:
    return f"{USER_CONNECTION_KEY_PREFIX}{user_id}"


class GmailNotConnectedError(RuntimeError):
    pass


class GmailClientService:
    def __init__(self, db: AsyncSession):
        self._db = db
        self._client_config_cache: dict[str, Any] | None = None

    async def get_status(self, user_id: int) -> tuple[bool, str | None, bool]:
        """Return (connected, account_email, requires_reauth)."""
        credential = await self._get_user_credential(user_id)
        if not credential:
            return False, None, False

        credentials = self._credentials_from_credential(credential)
        try:
            await self._refresh_credentials_if_needed(credential, credentials)
            if not credential.account_email:
                account_email = await asyncio.to_thread(
                    self._fetch_profile_email, credentials
                )
                if account_email:
                    credential.account_email = account_email
                    await self._db.commit()
            return True, credential.account_email, False
        except GmailNotConnectedError:
            return False, credential.account_email, True
        except Exception:
            return False, credential.account_email, False

    def build_authorization_url(self, state: str) -> str:
        flow = self._new_flow(state=state)
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
        )
        return auth_url

    async def exchange_code_for_user_credentials(
        self,
        authorization_response_url: str,
        *,
        user_id: int,
        state: str | None = None,
    ) -> str | None:
        credentials = await asyncio.to_thread(
            self._exchange_code_for_credentials, authorization_response_url, state
        )
        account_email = await asyncio.to_thread(self._fetch_profile_email, credentials)
        await self._upsert_user_credentials(
            credentials,
            account_email,
            user_id=user_id,
        )
        return account_email

    async def list_inbox_messages(
        self,
        *,
        user_id: int,
        page_size: int,
        page_token: str | None = None,
        q: str | None = None,
    ) -> GmailMessageListResponse:
        credential = await self._get_user_credential(user_id)
        if not credential:
            raise GmailNotConnectedError(
                "Gmail is not connected for this user."
            )

        credentials = self._credentials_from_credential(credential)
        await self._refresh_credentials_if_needed(credential, credentials)

        return await asyncio.to_thread(
            self._list_inbox_messages_sync,
            credentials,
            page_size,
            page_token,
            q,
        )

    async def send_message(
        self,
        *,
        user_id: int,
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        in_reply_to_message_id: str | None = None,
    ) -> GmailSendResponse:
        credential = await self._get_user_credential(user_id)
        if not credential:
            raise GmailNotConnectedError(
                "Gmail is not connected for this user."
            )

        credentials = self._credentials_from_credential(credential)
        await self._refresh_credentials_if_needed(credential, credentials)

        return await asyncio.to_thread(
            self._send_message_sync,
            credentials,
            to,
            subject,
            body,
            thread_id,
            in_reply_to_message_id,
        )

    async def disconnect(self, user_id: int) -> bool:
        credential = await self._get_user_credential(user_id)
        if not credential:
            return False
        await self._db.delete(credential)
        await self._db.commit()
        return True

    async def _get_user_credential(self, user_id: int) -> GmailCredential | None:
        result = await self._db.execute(
            select(GmailCredential).where(
                GmailCredential.connection_key == connection_key_for_user(user_id)
            )
        )
        return result.scalar_one_or_none()

    async def _upsert_user_credentials(
        self,
        credentials: Credentials,
        account_email: str | None,
        *,
        user_id: int,
    ) -> None:
        existing = await self._get_user_credential(user_id)
        refresh_token = credentials.refresh_token or (
            existing.refresh_token if existing else None
        )
        if not refresh_token:
            raise RuntimeError(
                "Google OAuth did not return a refresh token. Reconnect and approve consent."
            )
        if not credentials.token:
            raise RuntimeError("Google OAuth did not return an access token.")

        expiry = credentials.expiry
        if expiry and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        scopes = " ".join(credentials.scopes or settings.gmail_oauth_scopes)

        if existing:
            existing.access_token = credentials.token
            existing.refresh_token = refresh_token
            existing.scopes = scopes
            existing.token_expiry = expiry
            if account_email:
                existing.account_email = account_email
        else:
            self._db.add(
                GmailCredential(
                    connection_key=connection_key_for_user(user_id),
                    account_email=account_email,
                    access_token=credentials.token,
                    refresh_token=refresh_token,
                    scopes=scopes,
                    token_expiry=expiry,
                )
            )
        await self._db.commit()

    async def _refresh_credentials_if_needed(
        self, credential: GmailCredential, credentials: Credentials
    ) -> None:
        if credentials.valid and not credentials.expired:
            return

        try:
            await asyncio.to_thread(credentials.refresh, Request())
        except RefreshError:
            await self._db.delete(credential)
            await self._db.commit()
            raise GmailNotConnectedError(
                "Gmail token has expired or been revoked. Reconnect your Gmail account."
            )

        if credentials.token:
            credential.access_token = credentials.token
        if credentials.refresh_token:
            credential.refresh_token = credentials.refresh_token
        if credentials.scopes:
            credential.scopes = " ".join(credentials.scopes)
        expiry = credentials.expiry
        if expiry and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        credential.token_expiry = expiry
        await self._db.commit()

    def _credentials_from_credential(self, credential: GmailCredential) -> Credentials:
        client_info = self._get_client_info()
        scopes = (
            credential.scopes.split()
            if credential.scopes
            else settings.gmail_oauth_scopes
        )
        # google-auth compares expiry against a naive UTC datetime internally,
        # so strip tzinfo to avoid TypeError on aware vs naive comparison.
        expiry = credential.token_expiry
        if expiry is not None and expiry.tzinfo is not None:
            expiry = expiry.replace(tzinfo=None)
        return Credentials(
            token=credential.access_token,
            refresh_token=credential.refresh_token,
            token_uri=client_info["token_uri"],
            client_id=client_info["client_id"],
            client_secret=client_info["client_secret"],
            scopes=scopes,
            expiry=expiry,
        )

    def _exchange_code_for_credentials(
        self, authorization_response_url: str, state: str | None = None
    ) -> Credentials:
        flow = self._new_flow(state=state)
        flow.fetch_token(authorization_response=authorization_response_url)
        return flow.credentials

    def _new_flow(self, state: str | None = None) -> Flow:
        flow = Flow.from_client_config(
            self._load_client_config(),
            scopes=settings.gmail_oauth_scopes,
            state=state,
        )
        flow.redirect_uri = settings.gmail_oauth_redirect_uri
        return flow

    def _load_client_config(self) -> dict[str, Any]:
        if self._client_config_cache is not None:
            return self._client_config_cache

        if not settings.gmail_client_id or not settings.gmail_client_secret:
            raise RuntimeError(
                "Gmail OAuth credentials are not configured. "
                "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in your environment."
            )

        self._client_config_cache = {
            "web": {
                "client_id": settings.gmail_client_id,
                "client_secret": settings.gmail_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.gmail_oauth_redirect_uri],
            }
        }
        return self._client_config_cache

    def _get_client_info(self) -> dict[str, Any]:
        return self._load_client_config()["web"]

    def _fetch_profile_email(self, credentials: Credentials) -> str | None:
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        profile = service.users().getProfile(userId="me").execute()
        email = profile.get("emailAddress")
        return email if isinstance(email, str) else None

    def _list_inbox_messages_sync(
        self,
        credentials: Credentials,
        page_size: int,
        page_token: str | None,
        q: str | None,
    ) -> GmailMessageListResponse:
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)
        listing = (
            service.users()
            .messages()
            .list(
                userId="me",
                labelIds=["INBOX"],
                includeSpamTrash=False,
                maxResults=page_size,
                pageToken=page_token,
                q=q,
            )
            .execute()
        )

        items: list[GmailMessageRead] = []
        for item in listing.get("messages", []):
            message = (
                service.users()
                .messages()
                .get(
                    userId="me",
                    id=item["id"],
                    format="metadata",
                    metadataHeaders=["From", "To", "Subject", "Date"],
                )
                .execute()
            )
            headers = self._headers_to_map(
                message.get("payload", {}).get("headers", [])
            )
            labels = message.get("labelIds") or []

            received_at = self._extract_received_at(
                message.get("internalDate"), headers.get("date")
            )
            items.append(
                GmailMessageRead(
                    id=message.get("id", item["id"]),
                    thread_id=message.get("threadId"),
                    snippet=message.get("snippet"),
                    subject=headers.get("subject"),
                    from_header=headers.get("from"),
                    to_header=headers.get("to"),
                    labels=labels,
                    unread="UNREAD" in labels,
                    has_attachments=self._payload_has_attachments(
                        message.get("payload")
                    ),
                    received_at=received_at,
                )
            )

        return GmailMessageListResponse(
            items=items,
            page_size=page_size,
            next_page_token=listing.get("nextPageToken"),
            result_size_estimate=listing.get("resultSizeEstimate"),
        )

    def _send_message_sync(
        self,
        credentials: Credentials,
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        in_reply_to_message_id: str | None = None,
    ) -> GmailSendResponse:
        service = build("gmail", "v1", credentials=credentials, cache_discovery=False)

        mime = MIMEText(body, "plain")
        mime["To"] = to

        if thread_id and in_reply_to_message_id:
            if not subject.lower().startswith("re:"):
                subject = f"Re: {subject}"
            rfc_message_id = self._fetch_rfc_message_id(
                service, in_reply_to_message_id
            )
            if rfc_message_id:
                mime["In-Reply-To"] = rfc_message_id
                mime["References"] = rfc_message_id

        mime["Subject"] = subject
        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode("ascii")

        send_body: dict[str, Any] = {"raw": raw}
        if thread_id:
            send_body["threadId"] = thread_id

        sent = (
            service.users()
            .messages()
            .send(userId="me", body=send_body)
            .execute()
        )
        return GmailSendResponse(
            message_id=sent["id"],
            thread_id=sent.get("threadId"),
        )

    @staticmethod
    def _fetch_rfc_message_id(service: Any, gmail_message_id: str) -> str | None:
        """Fetch the RFC 2822 Message-ID header for a Gmail message."""
        try:
            msg = (
                service.users()
                .messages()
                .get(
                    userId="me",
                    id=gmail_message_id,
                    format="metadata",
                    metadataHeaders=["Message-ID"],
                )
                .execute()
            )
            for header in msg.get("payload", {}).get("headers", []):
                if (header.get("name") or "").lower() == "message-id":
                    return header.get("value")
        except Exception:
            pass
        return None

    @staticmethod
    def _headers_to_map(headers: list[dict[str, str]]) -> dict[str, str]:
        mapped: dict[str, str] = {}
        for header in headers:
            name = (header.get("name") or "").lower()
            value = header.get("value")
            if name and value and name not in mapped:
                mapped[name] = value
        return mapped

    @classmethod
    def _payload_has_attachments(cls, payload: dict[str, Any] | None) -> bool:
        if not payload:
            return False
        filename = payload.get("filename")
        if isinstance(filename, str) and filename:
            return True
        for part in payload.get("parts") or []:
            if cls._payload_has_attachments(part):
                return True
        return False

    @staticmethod
    def _extract_received_at(
        internal_date: str | None, date_header: str | None
    ) -> datetime | None:
        if internal_date:
            try:
                return datetime.fromtimestamp(
                    int(internal_date) / 1000, tz=timezone.utc
                )
            except (TypeError, ValueError):
                pass
        if date_header:
            try:
                parsed = parsedate_to_datetime(date_header)
                if parsed and parsed.tzinfo is None:
                    return parsed.replace(tzinfo=timezone.utc)
                return parsed
            except (TypeError, ValueError):
                return None
        return None
