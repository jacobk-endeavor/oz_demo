from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://openrouter.ai/api/v1"
CHAT_MODEL = "openai/gpt-5.4"

_MAX_RETRIES = 3
_RETRY_BACKOFF = (1, 2, 4)
_RETRYABLE_STATUS_CODES = {400, 408, 429, 500, 502, 503, 504}

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient | None:
    global _client
    if not settings.openrouter_api_key:
        return None
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(connect=10, read=120, write=10, pool=10),
        )
    return _client


def _require_client() -> httpx.AsyncClient:
    client = get_client()
    if client is None:
        raise RuntimeError("OpenRouter API key not configured")
    return client


def _truncate_for_log(value: Any, max_chars: int = 500) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, default=str)
        except TypeError:
            value = str(value)
    if len(value) <= max_chars:
        return value
    return f"{value[:max_chars]}... [truncated {len(value) - max_chars} chars]"


def _summarize_messages_for_log(
    messages: list[dict[str, Any]], max_messages: int = 6
) -> list[dict[str, Any]]:
    summaries: list[dict[str, Any]] = []
    for message in messages[-max_messages:]:
        summary: dict[str, Any] = {"role": message.get("role")}
        content = message.get("content")
        if isinstance(content, str):
            summary["content_preview"] = _truncate_for_log(content, max_chars=240)
            summary["content_length"] = len(content)
        elif content is not None:
            summary["content_preview"] = _truncate_for_log(content, max_chars=240)
        if message.get("tool_call_id"):
            summary["tool_call_id"] = message.get("tool_call_id")
        tool_calls = message.get("tool_calls")
        if isinstance(tool_calls, list):
            summary["tool_call_names"] = [
                (tc.get("function") or {}).get("name")
                for tc in tool_calls
                if isinstance(tc, dict)
            ]
        summaries.append(summary)
    return summaries


def _summarize_tools_for_log(tools: list[dict] | None) -> list[str]:
    if not tools:
        return []
    return [
        tool.get("function", {}).get("name", "unknown")
        for tool in tools
        if isinstance(tool, dict)
    ]


def _payload_summary(payload: dict[str, Any]) -> dict[str, Any]:
    messages = payload.get("messages")
    tools = payload.get("tools")
    return {
        "model": payload.get("model"),
        "temperature": payload.get("temperature"),
        "stream": payload.get("stream"),
        "tool_choice": payload.get("tool_choice"),
        "parallel_tool_calls": payload.get("parallel_tool_calls"),
        "message_count": len(messages) if isinstance(messages, list) else None,
        "messages": (
            _summarize_messages_for_log(messages)
            if isinstance(messages, list)
            else None
        ),
        "tool_names": _summarize_tools_for_log(tools if isinstance(tools, list) else None),
    }


# ---------------------------------------------------------------------------
# Retry helpers
# ---------------------------------------------------------------------------


async def _post_with_retry(
    client: httpx.AsyncClient,
    path: str,
    payload: dict[str, Any],
    *,
    operation: str = "openrouter_post",
) -> httpx.Response:
    """POST with exponential backoff on transient / provider errors."""
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        resp = await client.post(path, json=payload)
        if resp.status_code not in _RETRYABLE_STATUS_CODES:
            return resp
        logger.warning(
            "OpenRouter request retryable response | operation=%s path=%s attempt=%d/%d status=%s reason=%s body=%s payload=%s",
            operation,
            path,
            attempt + 1,
            _MAX_RETRIES,
            resp.status_code,
            resp.reason_phrase,
            _truncate_for_log(resp.text, max_chars=500),
            json.dumps(_payload_summary(payload), ensure_ascii=True, default=str),
        )
        last_exc = httpx.HTTPStatusError(
            f"{resp.status_code} {resp.reason_phrase}",
            request=resp.request,
            response=resp,
        )
        if attempt < _MAX_RETRIES - 1:
            await asyncio.sleep(_RETRY_BACKOFF[attempt])

    raise last_exc  # type: ignore[misc]


@asynccontextmanager
async def _stream_with_retry(
    client: httpx.AsyncClient,
    path: str,
    payload: dict[str, Any],
    *,
    operation: str = "openrouter_stream",
) -> AsyncGenerator[httpx.Response, None]:
    """Streaming POST with exponential backoff on transient errors.

    Yields the open ``httpx.Response`` for the caller to iterate over.
    """
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        yielded = False
        try:
            async with client.stream("POST", path, json=payload) as resp:
                if resp.status_code in _RETRYABLE_STATUS_CODES:
                    body = await resp.aread()
                    logger.warning(
                        "OpenRouter stream retryable response | operation=%s path=%s attempt=%d/%d status=%s reason=%s body=%s payload=%s",
                        operation,
                        path,
                        attempt + 1,
                        _MAX_RETRIES,
                        resp.status_code,
                        resp.reason_phrase,
                        _truncate_for_log(body.decode(errors="replace"), max_chars=500),
                        json.dumps(_payload_summary(payload), ensure_ascii=True, default=str),
                    )
                    last_exc = httpx.HTTPStatusError(
                        f"{resp.status_code} {resp.reason_phrase}",
                        request=resp.request,
                        response=resp,
                    )
                    if attempt < _MAX_RETRIES - 1:
                        await asyncio.sleep(_RETRY_BACKOFF[attempt])
                    continue
                resp.raise_for_status()
                yielded = True
                yield resp
                return
        except httpx.TransportError as exc:
            if yielded:
                raise
            logger.warning(
                "OpenRouter stream transport error | operation=%s path=%s attempt=%d/%d error=%s payload=%s",
                operation,
                path,
                attempt + 1,
                _MAX_RETRIES,
                exc,
                json.dumps(_payload_summary(payload), ensure_ascii=True, default=str),
            )
            last_exc = exc
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_BACKOFF[attempt])

    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Non-streaming completions
# ---------------------------------------------------------------------------


async def chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    tools: list[dict] | None = None,
    temperature: float = 0,
    response_format: dict | None = None,
    extra_body: dict | None = None,
) -> dict:
    """Non-streaming chat completion. Returns the parsed JSON response body."""
    client = _require_client()

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools is not None:
        payload["tools"] = tools
    if response_format is not None:
        payload["response_format"] = response_format
    if extra_body:
        payload.update(extra_body)

    resp = await _post_with_retry(
        client,
        "/chat/completions",
        payload,
        operation="chat_completion",
    )
    resp.raise_for_status()
    return resp.json()


async def chat_completion_with_tools(
    *,
    model: str,
    messages: list[dict],
    tools: list[dict],
    temperature: float = 0,
    response_format: dict | None = None,
    extra_body: dict | None = None,
) -> dict:
    """Non-streaming chat completion with tool calling."""
    return await chat_completion(
        model=model,
        messages=messages,  # type: ignore[arg-type]
        tools=tools,
        temperature=temperature,
        response_format=response_format,
        extra_body=extra_body,
    )


# ---------------------------------------------------------------------------
# Streaming completions
# ---------------------------------------------------------------------------


async def stream_chat_completion(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.3,
) -> AsyncGenerator[str, None]:
    """Streaming chat completion. Yields content text deltas."""
    client = _require_client()

    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    try:
        async with _stream_with_retry(
            client,
            "/chat/completions",
            payload,
            operation="stream_chat_completion",
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                    content = chunk["choices"][0]["delta"].get("content")
                    if content:
                        yield content
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
    except Exception:
        logger.exception(
            "OpenRouter stream_chat_completion failed | payload=%s",
            json.dumps(_payload_summary(payload), ensure_ascii=True, default=str),
        )
        raise


async def stream_chat_with_tools(
    *,
    model: str,
    messages: list[dict],
    tools: list[dict],
    tool_executor: Callable[[str, str], Awaitable[str | tuple[str, Any]]],
    temperature: float = 0.3,
    max_tool_rounds: int = 5,
) -> AsyncGenerator[str | dict, None]:
    """Streaming chat completion with a tool-calling loop.

    Yields ``str`` for content text deltas.  When the model emits tool calls
    they are executed (in parallel when multiple are returned) and the
    conversation continues automatically for up to *max_tool_rounds*.

    Structured ``dict`` events are yielded for tool-call lifecycle:
    ``{"type": "tool_call", "name": ..., "arguments": ...}`` when the model
    invokes a tool, and ``{"type": "tool_result", "name": ..., ...}`` once
    execution completes.

    ``tool_executor`` receives ``(function_name, arguments_json)`` and returns
    either a plain ``str`` (used as both LLM context and frontend payload) or
    a ``(str, metadata)`` tuple where the string is sent to the LLM and
    *metadata* is included in the ``tool_result`` event for the frontend.
    """
    client = _require_client()
    current_messages = list(messages)

    for round_index in range(max_tool_rounds):
        payload: dict[str, Any] = {
            "model": model,
            "messages": current_messages,
            "tools": tools,
            "tool_choice": "auto",
            "parallel_tool_calls": True,
            "temperature": temperature,
            "stream": True,
        }

        tool_calls_acc: dict[int, dict] = {}
        content_parts: list[str] = []

        try:
            async with _stream_with_retry(
                client,
                "/chat/completions",
                payload,
                operation="stream_chat_with_tools",
            ) as resp:
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"]
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

                    text = delta.get("content")
                    if text:
                        content_parts.append(text)
                        yield text

                    for tc_delta in delta.get("tool_calls", []):
                        idx = tc_delta["index"]
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {
                                "id": "",
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            }
                        acc = tool_calls_acc[idx]
                        if tc_delta.get("id"):
                            acc["id"] = tc_delta["id"]
                        fn = tc_delta.get("function", {})
                        if fn.get("name"):
                            acc["function"]["name"] = fn["name"]
                        if "arguments" in fn:
                            acc["function"]["arguments"] += fn["arguments"]
        except Exception:
            logger.exception(
                "OpenRouter stream_chat_with_tools failed | round=%d/%d partial_text=%s partial_tool_calls=%s payload=%s",
                round_index + 1,
                max_tool_rounds,
                _truncate_for_log("".join(content_parts), max_chars=400),
                json.dumps(
                    [
                        {
                            "tool_call_id": tc.get("id"),
                            "tool_name": (tc.get("function") or {}).get("name"),
                            "arguments": _truncate_for_log(
                                (tc.get("function") or {}).get("arguments"),
                                max_chars=400,
                            ),
                        }
                        for tc in tool_calls_acc.values()
                    ],
                    ensure_ascii=True,
                    default=str,
                ),
                json.dumps(_payload_summary(payload), ensure_ascii=True, default=str),
            )
            raise

        if not tool_calls_acc:
            return

        ordered_calls = [tool_calls_acc[i] for i in sorted(tool_calls_acc)]

        current_messages.append(
            {
                "role": "assistant",
                "content": "".join(content_parts) if content_parts else None,
                "tool_calls": ordered_calls,
            }
        )

        for tc in ordered_calls:
            try:
                args = json.loads(tc["function"]["arguments"])
            except (json.JSONDecodeError, TypeError):
                args = tc["function"]["arguments"]
            yield {
                "type": "tool_call",
                "name": tc["function"]["name"],
                "arguments": args,
            }

        async def _safe_execute(tc: dict) -> str | tuple[str, Any]:
            try:
                return await tool_executor(
                    tc["function"]["name"],
                    tc["function"]["arguments"],
                )
            except Exception:
                logger.exception(
                    "Tool execution failed | tool_name=%s tool_call_id=%s arguments=%s",
                    tc["function"]["name"],
                    tc.get("id"),
                    _truncate_for_log(tc["function"].get("arguments"), max_chars=1000),
                )
                return json.dumps({"error": "Tool execution failed"})

        results = await asyncio.gather(*(_safe_execute(tc) for tc in ordered_calls))

        for tc, raw in zip(ordered_calls, results):
            if isinstance(raw, tuple):
                llm_content, metadata = raw
            else:
                llm_content, metadata = raw, None

            current_messages.append(
                {"role": "tool", "tool_call_id": tc["id"], "content": llm_content}
            )
            event: dict[str, Any] = {
                "type": "tool_result",
                "name": tc["function"]["name"],
            }
            if metadata is not None:
                event["metadata"] = metadata
            else:
                event["content"] = llm_content
            yield event

    async for text in stream_chat_completion(
        model=model, messages=current_messages, temperature=temperature
    ):
        yield text


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def extract_content(response: dict) -> str | None:
    """Extract text content from a chat completion response dict."""
    try:
        content = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        return None
    if isinstance(content, str):
        return content.strip() or None
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            text = item.get("text") if isinstance(item, dict) else None
            if isinstance(text, str) and text:
                parts.append(text)
        return "\n".join(parts).strip() or None
    return None
