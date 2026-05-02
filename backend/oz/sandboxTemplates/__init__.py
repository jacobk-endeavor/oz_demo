"""
Server-side artifact templates for make_spreadsheet / make_docx / make_pdf.

Phase 2 runs these via ``python -m sandboxTemplates.<module>`` with PYTHONPATH
including ``backend/oz``. Phase 3 runs the same modules inside the sandbox image.

Input is JSON (file path via ``--input`` or stdin). Output path via ``--output``.
"""

__all__ = ["SCHEMA_VERSION"]

SCHEMA_VERSION = 1
