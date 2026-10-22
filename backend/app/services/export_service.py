"""Export Service for generating PDF Executive Dossiers and Excel Batch Portfolios.
Produces institutional-grade binary exports for financial risk committees.
"""

from __future__ import annotations

import io
from typing import Any, Dict, List
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter


def _escape_pdf_text(text: str) -> str:
    """Escape special characters for PDF text strings and replace non-ASCII characters."""
    if not text:
        return ""
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ñ": "n",
        "Á": "A",
        "É": "E",
        "Í": "I",
        "Ó": "O",
        "Ú": "U",
        "Ñ": "N",
        "(": "\\(",
        ")": "\\)",
        "\\": "\\\\",
    }
    cleaned = str(text)
    for k, v in replacements.items():
        cleaned = cleaned.replace(k, v)
    # Ensure all remaining non-ascii characters are cleaned for Latin1
    cleaned = "".join(c if ord(c) < 128 else " " for c in cleaned)
    return cleaned


def generate_cuit_pdf_dossier(debtor_data: Dict[str, Any]) -> bytes:
    """Generate a clean, professional 1-page PDF Executive Credit Dossier."""
    cuit = _escape_pdf_text(
        debtor_data.get("cuit_formateado") or debtor_data.get("cuit") or "N/A"
    )
    denominacion = _escape_pdf_text(debtor_data.get("denominacion", "N/A"))
    worst_sit = debtor_data.get("peor_situacion") or debtor_data.get("worst_situation") or 1
    total_debt = float(debtor_data.get("deuda_total") or debtor_data.get("total_debt") or 0.0)
    periodo = _escape_pdf_text(debtor_data.get("periodo", "Ultimo periodo informado"))

    badges: List[Dict[str, Any]] = (
        debtor_data.get("alertas_tempranas")
        or debtor_data.get("alert_badges")
        or []
    )
    entidades: List[Dict[str, Any]] = debtor_data.get("entidades", [])
    cheques_data: Dict[str, Any] = debtor_data.get("cheques_rechazados", {})
    if isinstance(cheques_data, dict):
        cheques_count = cheques_data.get("cantidad", 0)
        cheques_monto = cheques_data.get("total_monto", 0.0)
    else:
        cheques_count = debtor_data.get("total_cheques_rechazados", 0)
        cheques_monto = debtor_data.get("monto_cheques_rechazados", 0.0)

    sit_labels = {
        1: "1 - Normal / En situacion regular",
        2: "2 - Con seguimiento especial / Bajo observacion",
        3: "3 - Con problemas / Atraso 90-180 dias",
        4: "4 - Con alto riesgo de insolvencia / Atraso 180-360 dias",
        5: "5 - Irrecuperable / Atraso > 360 dias",
        6: "6 - Irrecuperable por disposicion tecnica",
    }
    sit_desc = _escape_pdf_text(sit_labels.get(worst_sit, f"Situacion {worst_sit}"))

    stream_lines = [
        "BT",
        "/F2 16 Tf",
        "50 750 Td",
        "(BANCO CENTRAL DE LA REPUBLICA ARGENTINA - CENTRAL DE DEUDORES) Tj",
        "/F1 11 Tf",
        "0 -20 Td",
        "(Dossier Ejecutivo de Riesgo Crediticio e Historial Deudor) Tj",
        "ET",
        "0.2 0.25 0.35 RG",
        "2 w",
        "50 720 m 562 720 l S",
        "BT",
        "/F2 12 Tf",
        "50 700 Td",
        f"(Titular: {denominacion}) Tj",
        "/F1 10 Tf",
        "0 -16 Td",
        f"(CUIT / CUIL: {cuit}   |   Periodo Base: {periodo}) Tj",
        "0 -16 Td",
        f"(Peor Situacion Crediticia: {sit_desc}) Tj",
        "0 -16 Td",
        f"(Deuda Consolidada Sistema Financiero: ARS $ {total_debt:,.2f}) Tj",
        "/F2 11 Tf",
        "0 -26 Td",
        f"(Banderas de Alerta Temprana ({len(badges)} activas):) Tj",
        "/F1 9 Tf",
    ]

    y_offset = -14
    if badges:
        for b in badges[:4]:
            b_name = _escape_pdf_text(b.get("name") or b.get("badge", "Alerta"))
            b_sev = _escape_pdf_text(str(b.get("severity", "MEDIUM")).upper())
            b_desc = _escape_pdf_text(b.get("description") or b.get("motivo", ""))
            stream_lines.append(f"0 {y_offset} Td")
            stream_lines.append(f"([ {b_sev} ] {b_name} - {b_desc}) Tj")
    else:
        stream_lines.append(f"0 {y_offset} Td")
        stream_lines.append("(Sin alertas tempranas registradas. Comportamiento crediticio regular.) Tj")

    stream_lines.extend(
        [
            "/F2 11 Tf",
            "0 -24 Td",
            f"(Detalle de Deuda por Entidad Financiera ({len(entidades)} reportadas):) Tj",
            "/F1 9 Tf",
        ]
    )

    if entidades:
        stream_lines.append("0 -14 Td")
        stream_lines.append("(Entidad                                     | Situacion | Monto (ARS Miles)) Tj")
        for ent in entidades[:6]:
            ent_name = _escape_pdf_text(ent.get("entidad", "Entidad")[:38]).ljust(42)
            ent_sit = str(ent.get("situacion", 1)).center(9)
            ent_monto = f"${ent.get('monto', 0.0):,.1f}".rjust(16)
            stream_lines.append("0 -13 Td")
            stream_lines.append(f"({ent_name} | {ent_sit} | {ent_monto}) Tj")
    else:
        stream_lines.append("0 -14 Td")
        stream_lines.append("(No registra deudas activas informadas en el sistema financiero.) Tj")

    stream_lines.extend(
        [
            "/F2 11 Tf",
            "0 -24 Td",
            "(Registro de Cheques Rechazados:) Tj",
            "/F1 9 Tf",
            "0 -14 Td",
            f"(Cantidad Total: {cheques_count} cheques   |   Monto Acumulado: ARS $ {cheques_monto:,.2f}) Tj",
            "/F1 8 Tf",
            "0 -40 Td",
            "(Documento emitido con fines informativos de analisis de riesgo crediticio.) Tj",
            "0 -11 Td",
            "(Fuentes Oficiales: Central de Deudores BCRA / DolarApi Argentina.) Tj",
            "ET",
        ]
    )

    stream_content = "\n".join(stream_lines)
    stream_bytes = stream_content.encode("latin1")

    obj1 = b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    obj2 = b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    obj3 = b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n"
    obj4 = (
        f"4 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin1")
        + stream_bytes
        + b"\nendstream\nendobj\n"
    )
    obj5 = b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    obj6 = b"6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"

    header = b"%PDF-1.4\n"

    offsets = [0]
    curr = len(header)
    for obj in [obj1, obj2, obj3, obj4, obj5, obj6]:
        offsets.append(curr)
        curr += len(obj)

    xref_offset = curr
    xref = b"xref\n0 7\n0000000000 65535 f \n"
    for off in offsets[1:]:
        xref += f"{off:010d} 00000 n \n".encode("latin1")

    trailer = f"trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode(
        "latin1"
    )

    return header + obj1 + obj2 + obj3 + obj4 + obj5 + obj6 + xref + trailer


def generate_batch_excel_portfolio(batch_data: Dict[str, Any]) -> bytes:
    """Generate an institutional-grade Excel workbook (.xlsx) summarizing evaluated batch portfolio."""
    wb = openpyxl.Workbook()

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    sub_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    title_font = Font(name="Segoe UI", size=15, bold=True, color="0F172A")
    header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
    bold_font = Font(name="Segoe UI", size=10, bold=True, color="1E293B")
    regular_font = Font(name="Segoe UI", size=10, color="334155")
    thin_border_side = Side(style="thin", color="CBD5E1")
    cell_border = Border(
        left=thin_border_side,
        right=thin_border_side,
        top=thin_border_side,
        bottom=thin_border_side,
    )

    ws = wb.active
    ws.title = "Resumen Portafolio"
    ws.views.sheetView[0].showGridLines = True

    ws["A1"] = "INFORME CONSOLIDADO DE PORTAFOLIO CREDITICIO (BCRA)"
    ws["A1"].font = title_font
    ws["A2"] = "Evaluación de Riesgo y Cartera de Deudores del Sistema Financiero"
    ws["A2"].font = Font(name="Segoe UI", size=10, italic=True, color="64748B")

    # Metrics section
    metrics = batch_data.get("metrics") or {}
    total_cuits = metrics.get("total_cuits") or batch_data.get("total_cuits", 0)
    valid_cuits = metrics.get("valid_cuits") or batch_data.get("valid_count", 0)
    invalid_cuits = metrics.get("invalid_cuits") or batch_data.get("invalid_count", 0)
    max_sit = metrics.get("max_situacion") or batch_data.get("peor_situacion_portfolio", 1)
    total_alerts = metrics.get("total_alerts") or 0

    debtors_list: List[Dict[str, Any]] = (
        batch_data.get("debtors")
        or batch_data.get("results")
        or []
    )
    if not total_alerts and debtors_list:
        total_alerts = sum(
            len(d.get("alertas_tempranas") or d.get("alert_badges") or []) for d in debtors_list
        )

    summary_items = [
        ("Total CUITs Evaluados", total_cuits or len(debtors_list)),
        ("CUITs Válidos", valid_cuits or len(debtors_list)),
        ("CUITs Inválidos", invalid_cuits),
        ("Peor Situación en Cartera", max_sit),
        ("Alertas Tempranas Totales", total_alerts),
    ]

    for col_idx, (label, val) in enumerate(summary_items, start=1):
        cell_lbl = ws.cell(row=4, column=col_idx, value=label)
        cell_lbl.font = bold_font
        cell_lbl.fill = sub_fill
        cell_lbl.alignment = Alignment(horizontal="center", vertical="center")
        cell_lbl.border = cell_border

        cell_val = ws.cell(row=5, column=col_idx, value=val)
        cell_val.font = Font(name="Segoe UI", size=12, bold=True, color="0F172A")
        cell_val.alignment = Alignment(horizontal="center", vertical="center")
        cell_val.border = cell_border

    headers = [
        "CUIT / CUIL",
        "Denominación",
        "Peor Situación",
        "Deuda Total (ARS)",
        "Entidades",
        "Cheques Rechazados",
        "Monto Cheques (ARS)",
        "Cant. Alertas",
        "Detalle de Alertas",
    ]

    for col_idx, h_text in enumerate(headers, start=1):
        c = ws.cell(row=7, column=col_idx, value=h_text)
        c.font = header_font
        c.fill = header_fill
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = cell_border

    current_row = 8
    for item in debtors_list:
        badges = item.get("alertas_tempranas") or item.get("alert_badges") or []
        badge_names = (
            ", ".join(b.get("name") or b.get("badge", "") for b in badges)
            if badges
            else "Sin alertas"
        )
        cheques = item.get("cheques_rechazados", {})
        if isinstance(cheques, dict):
            chq_count = cheques.get("cantidad", 0)
            chq_monto = cheques.get("total_monto", 0.0)
        else:
            chq_count = item.get("total_cheques_rechazados", 0)
            chq_monto = item.get("monto_cheques_rechazados", 0.0)

        cuit_str = item.get("cuit_formateado") or item.get("cuit", "")
        denominacion = item.get("denominacion", "")
        peor_sit = item.get("peor_situacion") or item.get("worst_situation") or 1
        deuda = float(item.get("deuda_total") or item.get("total_debt") or 0.0)
        ents_count = item.get("cantidad_entidades") or len(item.get("entidades", []))

        row_data = [
            cuit_str,
            denominacion,
            peor_sit,
            deuda,
            ents_count,
            chq_count,
            chq_monto,
            len(badges),
            badge_names,
        ]

        for col_idx, val in enumerate(row_data, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = regular_font
            cell.border = cell_border

            if col_idx in [4, 7]:
                cell.number_format = '"$"#,##0.00'
                cell.alignment = Alignment(horizontal="right")
            elif col_idx in [1, 3, 5, 6, 8]:
                cell.alignment = Alignment(horizontal="center")
            else:
                cell.alignment = Alignment(horizontal="left")

        current_row += 1

    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.row < 7:
                continue
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
