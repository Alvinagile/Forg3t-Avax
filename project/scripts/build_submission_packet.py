from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.shared import Inches, Pt, RGBColor
import json


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "grant-review"
ASSET_DIR = OUT_DIR / "submission-assets"
SS_DIR = ASSET_DIR / "screenshots"
VIDEO_DIR = ASSET_DIR / "video"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

DOCX_PATH = OUT_DIR / "forg3t-avalanche-phase2-submission-packet.docx"
GIF_PATH = VIDEO_DIR / "forg3t-avalanche-phase2-proof-walkthrough.gif"
THUMB_PATH = VIDEO_DIR / "forg3t-avalanche-phase2-proof-walkthrough-cover.png"

ACCENT = "E84142"
BLUE = "2F80ED"
INK = "111827"
MUTED = "4B5563"
BORDER = "E5E7EB"
GREEN = "059669"
AMBER = "D97706"

REPO_URL = "https://github.com/Alvinagile/Forg3t-Avax"
CODE_COMMIT = "0778fc09a184457702a88932032aad83bdd3f1af"
CODE_COMMIT_SHORT = CODE_COMMIT[:7]
LIVE_APP = "https://buildgames.forg3t.io"
LATEST_VERIFY = "https://buildgames.forg3t.io/verify/636919b6e97441df953d98278bbc0efe"
LATEST_TX = "https://snowtrace.io/tx/0x4f9d253d097808406777ba1b9d67b0ac4baac44d34d1d101cea4a3721559c69b"
CONTRACT = "0x20E772a60CEE7D8E6706E698B129FD917c3936bf"
LATEST_TX_HASH = "0x4f9d253d097808406777ba1b9d67b0ac4baac44d34d1d101cea4a3721559c69b"
LATEST_BLOCK = "87016942"
LATEST_EVIDENCE_HASH = "0xb78cec95881bdee14f70b9c81e2b75cdb50982cedf73fbaeff9ff511973b9d88"
LATEST_JOB_HASH = "0xdaab2cee2e3a570ecfc45bda3679bff1db470a068c18bc33b6daa80dff806733"


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def fit_paste(canvas: Image.Image, image: Image.Image, box: tuple[int, int, int, int]) -> None:
    x, y, w, h = box
    img = image.convert("RGB")
    scale = min(w / img.width, h / img.height)
    size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
    img = img.resize(size, Image.LANCZOS)
    canvas.paste(img, (x + (w - size[0]) // 2, y + (h - size[1]) // 2))


def wrap(draw: ImageDraw.ImageDraw, text: str, text_font, max_width: int) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textbbox((0, 0), trial, font=text_font)[2] <= max_width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def make_frame(title: str, subtitle: str, img_path: Path, step: int) -> Image.Image:
    width, height = 1280, 720
    base = Image.new("RGB", (width, height), "#0B1220")
    draw = ImageDraw.Draw(base)
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=(15 + y // 120, 23 + y // 120, 42 + y // 80))
    draw.rectangle([0, 0, 12, height], fill=f"#{ACCENT}")
    draw.text((46, 34), "Forg3t Protocol Avalanche Phase 2", font=font(34, True), fill="#F8FAFC")
    draw.text((46, 82), title, font=font(23, True), fill="#93C5FD")
    card = (70, 128, 1140, 500)
    draw.rounded_rectangle(
        [card[0] - 10, card[1] - 10, card[0] + card[2] + 10, card[1] + card[3] + 10],
        radius=22,
        fill="#FFFFFF",
    )
    fit_paste(base, Image.open(img_path), card)
    draw.rounded_rectangle([44, 646, 1236, 696], radius=18, fill="#111827")
    for line in wrap(draw, subtitle, font(22), 1120)[:2]:
        draw.text((68, 660), line, font=font(22), fill="#F8FAFC")
    for index in range(4):
        fill = f"#{ACCENT}" if index <= step else "#334155"
        draw.rounded_rectangle([1110 + index * 32, 40, 1130 + index * 32, 60], radius=10, fill=fill)
    return base


def generate_walkthrough() -> None:
    slides = [
        (
            "GitHub Repository Current",
            "main branch contains the Phase 2 evidence package and the latest pushed code evidence commit.",
            SS_DIR / "github-current.png",
        ),
        (
            "Production App",
            "buildgames.forg3t.io is the live reviewer surface for the Forg3t + Avalanche workflow.",
            SS_DIR / "production-home.png",
        ),
        (
            "Auditor Verification",
            "Public verify route shows drag-and-drop JSON/PDF verification and confirmed anchor state.",
            SS_DIR / "public-verify-latest.png",
        ),
        (
            "Avalanche Mainnet Proof",
            "Snowtrace shows Submit Evidence, Success status, transaction hash, block number, and C-Chain metadata.",
            SS_DIR / "snowtrace-latest-tx.png",
        ),
    ]
    frames = [make_frame(title, subtitle, image, index) for index, (title, subtitle, image) in enumerate(slides) if image.exists()]
    if frames:
        frames[0].save(GIF_PATH, save_all=True, append_images=frames[1:], duration=1850, loop=0, optimize=True)
        frames[0].save(THUMB_PATH)
    probe = SS_DIR / "_probe-blank.png"
    if probe.exists():
        probe.unlink()


def set_cell_shading(cell, fill: str) -> None:
    props = cell._tc.get_or_add_tcPr()
    shd = props.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        props.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_border(cell, color: str = BORDER, size: str = "8") -> None:
    props = cell._tc.get_or_add_tcPr()
    borders = props.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        props.append(borders)
    for edge in ("top", "left", "bottom", "right"):
        tag = f"w:{edge}"
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:space"), "0")
        element.set(qn("w:color"), color)


def set_cell_text(cell, text: str, bold: bool = False, color: str = INK, size: float = 9):
    cell.text = ""
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text))
    run.bold = bold
    run.font.size = Pt(size)
    run.font.color.rgb = RGBColor.from_string(color)
    return paragraph


def add_hyperlink(paragraph, text: str, url: str) -> None:
    rel_id = paragraph.part.relate_to(url, RT.HYPERLINK, is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), BLUE)
    props.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(underline)
    run.append(props)
    text_node = OxmlElement("w:t")
    text_node.text = text
    run.append(text_node)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    paragraph = doc.add_paragraph()
    paragraph.style = f"Heading {level}"
    paragraph.paragraph_format.space_before = Pt(10 if level == 1 else 6)
    paragraph.paragraph_format.space_after = Pt(5)
    run = paragraph.add_run(text)
    run.font.color.rgb = RGBColor.from_string(INK if level == 1 else ACCENT)


def add_small_caps(doc: Document, text: str) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run(text.upper())
    run.bold = True
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor.from_string(ACCENT)


def add_body(doc: Document, text: str, bold_prefix: str | None = None) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(6)
    paragraph.paragraph_format.line_spacing = 1.06
    if bold_prefix and text.startswith(bold_prefix):
        bold = paragraph.add_run(bold_prefix)
        bold.bold = True
        bold.font.color.rgb = RGBColor.from_string(INK)
        bold.font.size = Pt(10)
        rest = paragraph.add_run(text[len(bold_prefix):])
        rest.font.size = Pt(10)
        rest.font.color.rgb = RGBColor.from_string(MUTED)
    else:
        run = paragraph.add_run(text)
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor.from_string(MUTED)


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        paragraph = doc.add_paragraph(style="List Bullet")
        paragraph.paragraph_format.left_indent = Inches(0.22)
        paragraph.paragraph_format.space_after = Pt(2)
        run = paragraph.add_run(item)
        run.font.size = Pt(9.3)
        run.font.color.rgb = RGBColor.from_string(MUTED)


def add_callout(doc: Document, title: str, body: str, fill: str = "F8FAFC", stripe: str = ACCENT) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Inches(0.12)
    table.columns[1].width = Inches(6.15)
    stripe_cell, body_cell = table.rows[0].cells
    set_cell_shading(stripe_cell, stripe)
    set_cell_shading(body_cell, fill)
    for cell in (stripe_cell, body_cell):
        set_cell_border(cell, fill)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    title_p = body_cell.paragraphs[0]
    title_p.paragraph_format.space_after = Pt(2)
    title_run = title_p.add_run(title)
    title_run.bold = True
    title_run.font.size = Pt(10)
    title_run.font.color.rgb = RGBColor.from_string(INK)
    body_p = body_cell.add_paragraph()
    body_p.paragraph_format.space_after = Pt(0)
    body_run = body_p.add_run(body)
    body_run.font.size = Pt(9)
    body_run.font.color.rgb = RGBColor.from_string(MUTED)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_image(doc: Document, image_path: Path, caption: str, width: float = 6.35) -> None:
    if not image_path.exists():
        add_callout(doc, "Missing visual asset", str(image_path), fill="FEF2F2", stripe=ACCENT)
        return
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.add_run().add_picture(str(image_path), width=Inches(width))
    caption_p = doc.add_paragraph()
    caption_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_p.paragraph_format.space_after = Pt(8)
    run = caption_p.add_run(caption)
    run.italic = True
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor.from_string(MUTED)


def add_table(doc: Document, headers: list[str], rows: list[tuple[str, ...]], header_fill: str = INK) -> None:
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    header_cells = table.rows[0].cells
    for index, heading in enumerate(headers):
        set_cell_shading(header_cells[index], header_fill)
        set_cell_border(header_cells[index], header_fill)
        set_cell_text(header_cells[index], heading, bold=True, color="FFFFFF", size=8.2)
    for row in rows:
        cells = table.add_row().cells
        for index, value in enumerate(row):
            set_cell_shading(cells[index], "FFFFFF")
            set_cell_border(cells[index])
            size = 7.6 if len(str(value)) > 90 else 8.1
            paragraph = set_cell_text(cells[index], value, bold=index == 0, color=INK if index == 0 else MUTED, size=size)
            if index == 1 and str(value).startswith("Completed"):
                paragraph.runs[0].font.color.rgb = RGBColor.from_string(GREEN)
            if index == 1 and "Mostly" in str(value):
                paragraph.runs[0].font.color.rgb = RGBColor.from_string(AMBER)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_link_line(doc: Document, label: str, url: str) -> None:
    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run(f"{label}: ")
    run.bold = True
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor.from_string(INK)
    add_hyperlink(paragraph, url, url)


def setup_styles(doc: Document) -> None:
    styles = doc.styles
    styles["Normal"].font.name = "Aptos"
    styles["Normal"]._element.rPr.rFonts.set(qn("w:eastAsia"), "Aptos")
    styles["Normal"].font.size = Pt(10)
    for name, size in (("Heading 1", 18), ("Heading 2", 13), ("Heading 3", 11)):
        style = styles[name]
        style.font.name = "Aptos Display"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Aptos Display")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(INK)


def add_cover(doc: Document) -> None:
    table = doc.add_table(rows=1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    table.columns[0].width = Inches(0.18)
    table.columns[1].width = Inches(6.22)
    accent_cell, content_cell = table.rows[0].cells
    set_cell_shading(accent_cell, ACCENT)
    set_cell_shading(content_cell, "FFFFFF")
    for cell in table.rows[0].cells:
        set_cell_border(cell, "FFFFFF")
    logo_path = ROOT / "public" / "assets" / "forg3t-logo.png"
    paragraph = content_cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(4)
    if logo_path.exists():
        paragraph.add_run().add_picture(str(logo_path), width=Inches(0.68))
    brand = content_cell.add_paragraph()
    brand.paragraph_format.space_after = Pt(0)
    brand_run = brand.add_run("Forg3t Protocol")
    brand_run.bold = True
    brand_run.font.size = Pt(16)
    brand_run.font.color.rgb = RGBColor.from_string(INK)
    title = content_cell.add_paragraph()
    title_run = title.add_run("Avalanche Grant Phase 2 Completion Packet")
    title_run.bold = True
    title_run.font.size = Pt(28)
    title_run.font.color.rgb = RGBColor.from_string(ACCENT)
    title.paragraph_format.space_after = Pt(6)
    subtitle = content_cell.add_paragraph()
    subtitle_run = subtitle.add_run(
        "Reviewer-ready evidence packet for Avalanche mainnet anchoring, auditor verification, reporting exports, RBAC, repeatable pipelines, API integrations, documentation, and production review routes."
    )
    subtitle_run.font.size = Pt(11)
    subtitle_run.font.color.rgb = RGBColor.from_string(MUTED)

    rows = [
        ("Prepared for", "Avalanche Grant Review"),
        ("Prepared date", "June 4, 2026"),
        ("Live app", LIVE_APP),
        ("GitHub", REPO_URL),
        ("Verified code/evidence commit", f"{CODE_COMMIT_SHORT} ({CODE_COMMIT})"),
        ("Network", "Avalanche C-Chain mainnet"),
        ("Anchor contract", CONTRACT),
        ("Latest proof transaction", LATEST_TX_HASH),
    ]
    meta = doc.add_table(rows=0, cols=2)
    meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    for key, value in rows:
        cells = meta.add_row().cells
        set_cell_shading(cells[0], "F3F4F6")
        set_cell_shading(cells[1], "FFFFFF")
        set_cell_border(cells[0])
        set_cell_border(cells[1])
        set_cell_text(cells[0], key, bold=True, color=INK, size=8.5)
        set_cell_text(cells[1], value, color=MUTED, size=8.5)
    doc.add_paragraph()
    add_callout(
        doc,
        "Submission Position",
        "Repository-controlled Phase 2 product work is ready for review. External customer pilot approval or founder-recorded sales material is intentionally not claimed inside this repository packet unless supplied separately.",
        fill="FFF7ED",
        stripe=AMBER,
    )
    doc.add_page_break()


def build_docx() -> None:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.55)
    section.left_margin = Inches(0.6)
    section.right_margin = Inches(0.6)
    setup_styles(doc)
    add_cover(doc)

    add_small_caps(doc, "Executive Summary")
    add_heading(doc, "Phase 2 Evidence Status")
    add_body(
        doc,
        "Forg3t Protocol is an AI unlearning and suppression evidence control plane. The current repository and production reviewer flow show deterministic evidence generation, Avalanche mainnet anchoring, public verification, role-aware dashboard workflows, repeatable pipelines, reporting exports, and API-based AI integration support.",
    )
    add_body(
        doc,
        "The strongest live proof in this packet is the June 2, 2026 Avalanche C-Chain transaction that records a Submit Evidence action for a Forg3t evidence hash. The corresponding public verify route shows the auditor-facing verification surface, while the repository contains the backend functions, migrations, frontend components, tests, scripts, and documentation needed to reproduce the workflow.",
    )
    add_callout(
        doc,
        "Truthfulness Boundary",
        "This packet does not embed passwords, Supabase service-role credentials, Avalanche private keys, or unverified enterprise customer claims. Reviewer credentials and any customer attestation should be shared through a secure external channel.",
    )
    for label, url in (
        ("GitHub repository", REPO_URL),
        ("Live production app", LIVE_APP),
        ("Latest public verify proof", LATEST_VERIFY),
        ("Latest Snowtrace transaction", LATEST_TX),
        ("Walkthrough animation", GIF_PATH.as_posix()),
    ):
        add_link_line(doc, label, url)

    add_heading(doc, "Visual Evidence")
    add_body(
        doc,
        "The screenshots below were captured from live GitHub, buildgames.forg3t.io, and Snowtrace on June 4, 2026, after the Phase 2 evidence package was pushed to main.",
    )
    add_image(doc, SS_DIR / "github-current.png", f"GitHub repository on main showing Phase 2 evidence package commit {CODE_COMMIT_SHORT}.")
    add_image(doc, SS_DIR / "public-verify-latest.png", "Public auditor verification route with drag-and-drop evidence upload and confirmed anchor state.")
    add_image(doc, SS_DIR / "snowtrace-latest-tx.png", f"Snowtrace transaction proof: Success, C-Chain, block {LATEST_BLOCK}, Submit Evidence method.")
    add_image(doc, THUMB_PATH, "Walkthrough animation cover. Full GIF artifact is included under project/docs/grant-review/submission-assets/video/.")
    doc.add_page_break()

    add_small_caps(doc, "Milestone Completion Matrix")
    add_heading(doc, "Avalanche Phase 2 Milestones")
    add_table(
        doc,
        ["Milestone", "Status", "Evidence", "Main proof", "Risk", "Owner", "Effort"],
        [
            ("1. Production-grade evidence anchoring on Avalanche", "Completed", "Strong", "Live mainnet tx; Edge Function anchor path; transaction hash/network/block/explorer surfaced.", "Low", "Engineering", "Done"),
            ("2. Drag-and-drop verification for auditors and third parties", "Completed", "Strong", "JSON/PDF upload states; public verify route; valid/mismatch/pending/confirmed/failed handling.", "Low", "Frontend + Backend", "Done"),
            ("3. Job history, transaction visibility, evidence verification UX", "Completed", "Strong", "Jobs list/detail, evidence detail, public verify link, anchor metadata, report exports.", "Low", "Product Engineering", "Done"),
            ("4. Technical architecture and compliance workflow documentation", "Completed", "Strong", "Architecture, readiness, reviewer runbook, API and Avalanche article docs committed.", "Low", "Engineering + Docs", "Done"),
            ("5. Enterprise and regulated AI use-case pilot", "Mostly completed", "Medium", "Product flow supports regulated AI reviews; external enterprise/customer attestation not embedded.", "Medium", "Founder / BD", "1-3 days for external artifacts"),
            ("6. Role-based admin workflows and reporting exports", "Completed", "Strong", "RBAC matrix, project memberships, JSON/CSV/PDF reports, role tests.", "Low", "Backend + Frontend", "Done"),
            ("7. Repeatable verification pipelines for multiple jobs", "Completed", "Strong", "Pipeline create/run APIs generate jobs/evidence/reports and optional anchoring.", "Low", "Backend", "Done"),
            ("8. API-based AI system integrations", "Completed", "Strong", "OpenAI-compatible and generic HTTP integrations, curl docs, smoke artifacts.", "Low", "Integrations", "Done"),
        ],
        header_fill=INK,
    )

    details = [
        (
            "1. Launch production-grade evidence anchoring on Avalanche",
            "Completed",
            [
                f"Live Avalanche mainnet tx: {LATEST_TX_HASH}",
                f"Block number: {LATEST_BLOCK}",
                f"Public verify proof: {LATEST_VERIFY}",
                f"Anchor contract: {CONTRACT}",
                f"Evidence hash: {LATEST_EVIDENCE_HASH}",
                f"Job hash: {LATEST_JOB_HASH}",
            ],
            [
                "project/supabase/functions/anchors/index.ts",
                "project/supabase/functions/verify-evidence/index.ts",
                "project/supabase/migrations/20260430170000_avalanche_build_games.sql",
                "project/src/pages/JobDetail.tsx",
                "project/src/pages/EvidenceDetail.tsx",
                "project/src/lib/domainUtils.ts",
                "project/scripts/phase2-smoke.mjs",
                "project/scripts/reviewer-daily-anchor.mjs",
                "project/docs/grant-review/submission-assets/screenshots/snowtrace-latest-tx.png",
            ],
        ),
        (
            "2. Ship drag-and-drop verification flow for auditors and third parties",
            "Completed",
            [
                "Auditor route accepts JSON evidence bundles and PDF reports where hash metadata is available.",
                "States represented include valid, mismatch, unsupported, pending, confirmed, and failed anchor outcomes.",
            ],
            [
                "project/src/pages/Verify.tsx",
                "project/src/lib/hash.ts",
                "project/supabase/functions/verify-evidence/index.ts",
                "project/docs/grant-review/evidence-artifacts/api/verify-upload-json-valid-response.json",
                "project/docs/grant-review/evidence-artifacts/api/verify-upload-json-mismatch-response.json",
                "project/docs/grant-review/evidence-artifacts/api/verify-upload-pdf-valid-response.json",
                "project/docs/grant-review/submission-assets/screenshots/public-verify-latest.png",
            ],
        ),
        (
            "3. Complete job history, transaction visibility, and evidence verification UX",
            "Completed",
            [
                "Reviewer can navigate job list, job detail, evidence detail, public verify link, Avalanche record, and report downloads.",
                "Transaction hash, network, block number, explorer link, status, job hash, and evidence hash are visible in reviewer UX.",
            ],
            [
                "project/src/pages/Jobs.tsx",
                "project/src/pages/JobDetail.tsx",
                "project/src/pages/EvidenceDetail.tsx",
                "project/src/components/JobsTable.tsx",
                "project/src/lib/api.ts",
                "project/docs/grant-review/evidence-artifacts/api/jobs-list.json",
                "project/docs/grant-review/evidence-artifacts/api/job-detail.json",
            ],
        ),
        (
            "4. Publish technical architecture and compliance workflow documentation",
            "Completed",
            ["Reviewer runbook, readiness commands, architecture narrative, API lifecycle, and Avalanche anchoring article are in-repo."],
            [
                "project/README.md",
                "project/docs/phase2-readiness.md",
                "project/docs/avalanche/technicalArchitecture.md",
                "project/docs/avalanche/reviewerRunbook.md",
                "project/docs/avalanche/avalanche-anchor-article.md",
                "project/docs/api/evidenceAnchoring.md",
            ],
        ),
        (
            "5. Pilot with enterprise and regulated AI use cases",
            "Mostly completed",
            [
                "Repo demonstrates regulated AI review primitives: suppression jobs, evidence bundles, audit exports, public verification, role-scoped review, and repeatable pipelines.",
                "External enterprise customer approval, signed pilot attestation, or founder demo recording should be supplied outside the repository if Avalanche requests it.",
            ],
            [
                "project/src/pages/Unlearning.tsx",
                "project/shared/suppression.test.ts",
                "project/shared/workflows.test.ts",
                "project/docs/compliance/auditWorkflow.md",
                "project/docs/phase2-readiness.md",
            ],
        ),
        (
            "6. Add role-based admin workflows and reporting exports",
            "Completed",
            [
                "Owner/admin/compliance/auditor/developer/viewer behavior is encoded in shared role helpers and backend policies.",
                "JSON, CSV, and PDF report export paths are supported from real job and evidence records.",
            ],
            [
                "project/src/lib/domainUtils.ts",
                "project/src/lib/domainUtils.test.ts",
                "project/src/pages/Settings.tsx",
                "project/src/lib/pdfGenerator.ts",
                "project/supabase/functions/reports/index.ts",
                "project/supabase/functions/_shared/rbac.ts",
                "project/docs/grant-review/evidence-artifacts/exports/forg3t-evidence-export.json",
                "project/docs/grant-review/evidence-artifacts/exports/forg3t-evidence-export.csv",
                "project/docs/grant-review/evidence-artifacts/exports/forg3t-evidence-export.pdf",
            ],
        ),
        (
            "7. Introduce repeatable verification pipelines for multiple unlearning jobs",
            "Completed",
            ["Pipeline runs can expand scoped items into multiple jobs, generate evidence, create reports, and optionally anchor when configured."],
            [
                "project/src/pages/Pipelines.tsx",
                "project/supabase/functions/pipelines/index.ts",
                "project/docs/grant-review/evidence-artifacts/api/pipeline-create.json",
                "project/docs/grant-review/evidence-artifacts/api/pipeline-run.json",
                "project/docs/grant-review/evidence-artifacts/api/pipeline-detail-with-runs.json",
                "project/docs/grant-review/evidence-artifacts/screenshots/pipeline-run.png",
            ],
        ),
        (
            "8. Expand integrations for teams using API-based AI systems",
            "Completed",
            ["OpenAI-compatible and generic HTTP integrations support setup, health checks, stored server-side secrets, and job lifecycle linkage."],
            [
                "project/src/pages/Settings.tsx",
                "project/src/pages/Unlearning.tsx",
                "project/supabase/functions/integrations/index.ts",
                "project/docs/grant-review/evidence-artifacts/api/integration-create-generic-http.json",
                "project/docs/grant-review/evidence-artifacts/api/integration-test-generic-http.json",
                "project/docs/phase2-readiness.md",
            ],
        ),
    ]

    add_heading(doc, "Milestone Evidence")
    for title, status, proof, files in details:
        add_heading(doc, title, 2)
        add_body(doc, f"Status: {status}", bold_prefix="Status:")
        add_bullets(doc, proof)
        add_body(doc, "Repository evidence:")
        add_bullets(doc, files)

    doc.add_page_break()
    add_small_caps(doc, "Additional Product Screenshots")
    add_heading(doc, "Reviewer UX and Admin Evidence")
    existing_ss = OUT_DIR / "evidence-artifacts" / "screenshots"
    add_image(doc, existing_ss / "job-list.png", "Job history and anchor visibility evidence from the reviewer evidence artifacts.")
    add_image(doc, existing_ss / "job-detail.png", "Job detail page showing evidence, anchor actions, public verify route, and report export controls.")
    add_image(doc, existing_ss / "evidence-detail.png", "Evidence detail page with manifest, commitments, report payload, and Avalanche record.")
    add_image(doc, existing_ss / "pipeline-run.png", "Repeatable verification pipeline run evidence.")
    add_image(doc, existing_ss / "admin-role-settings-and-integrations.png", "Role settings and API integration administration evidence.")

    doc.add_page_break()
    add_small_caps(doc, "Local Verification")
    add_heading(doc, "Commands to Run")
    add_body(
        doc,
        "These commands avoid embedding secrets. Public VITE variables should come from local .env or Netlify production environment, while service-role and Avalanche signer material remain server-side only.",
    )
    add_table(
        doc,
        ["Purpose", "Command"],
        [
            ("Install", "cd project && npm install"),
            ("Unit tests", "cd project && npm test"),
            ("Production build", "cd project && npm run build"),
            ("Smoke flow without live anchoring", "cd project && npm run smoke:phase2"),
            ("Daily reviewer anchor flow", "cd project && npm run automation:reviewer-anchor"),
            ("Bootstrap reviewer/automation accounts", "cd project && npm run bootstrap:reviewer"),
            ("Verify GitHub sync", "git rev-parse --short HEAD && git rev-parse --short origin/main"),
        ],
        header_fill=ACCENT,
    )
    add_callout(
        doc,
        "Commands already run for this packet",
        "npm test passed: 4 test files and 15 tests. The production build completed successfully with the Netlify production VITE environment and Avalanche default network set to mainnet. GitHub main matched origin/main at commit 0778fc0 before this submission packet was generated.",
        fill="ECFDF5",
        stripe=GREEN,
    )

    add_heading(doc, "Evidence Package Index")
    add_table(
        doc,
        ["Artifact", "Repository path"],
        [
            ("Submission packet", "project/docs/grant-review/forg3t-avalanche-phase2-submission-packet.docx"),
            ("Live screenshots", "project/docs/grant-review/submission-assets/screenshots/"),
            ("Walkthrough animation", "project/docs/grant-review/submission-assets/video/forg3t-avalanche-phase2-proof-walkthrough.gif"),
            ("API response artifacts", "project/docs/grant-review/evidence-artifacts/api/"),
            ("JSON/CSV/PDF exports", "project/docs/grant-review/evidence-artifacts/exports/"),
            ("Existing evidence DOCX", "project/docs/grant-review/forg3t-avalanche-phase2-evidence-artifacts.docx"),
            ("Grant manager packet", "project/docs/grant-review/forg3t-avalanche-phase2-grant-manager-packet.docx"),
            ("Architecture docs", "project/docs/avalanche/technicalArchitecture.md"),
            ("Reviewer runbook", "project/docs/avalanche/reviewerRunbook.md"),
            ("Anchor article", "project/docs/avalanche/avalanche-anchor-article.md"),
        ],
        header_fill=INK,
    )

    add_heading(doc, "Recommended Evidence Package for Avalanche")
    add_bullets(
        doc,
        [
            "This Word packet and the repository link.",
            f"Snowtrace transaction link and screenshot for transaction {LATEST_TX_HASH}.",
            f"Public verify link {LATEST_VERIFY}.",
            "buildgames.forg3t.io reviewer credentials shared securely outside GitHub and outside this Word file.",
            "Generated JSON, CSV, and PDF report exports from project/docs/grant-review/evidence-artifacts/exports/.",
            "Walkthrough GIF under project/docs/grant-review/submission-assets/video/.",
            "Optional external pilot/customer attestation, if Avalanche needs business validation beyond code-side proof.",
        ],
    )
    add_callout(
        doc,
        "Final Readiness Statement",
        "Forg3t is ready to submit the code-side Phase 2 disbursement evidence package. The only non-repository gap is external enterprise pilot/customer evidence, which should be provided separately if required by Avalanche review.",
        fill="EFF6FF",
        stripe=BLUE,
    )

    for section in doc.sections:
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = footer.add_run("Forg3t Protocol | Avalanche Phase 2 Completion Packet | June 4, 2026")
        run.font.size = Pt(8)
        run.font.color.rgb = RGBColor.from_string(MUTED)

    doc.core_properties.title = "Forg3t Protocol Avalanche Grant Phase 2 Completion Packet"
    doc.core_properties.subject = "Avalanche Phase 2 milestone evidence package"
    doc.core_properties.author = "Forg3t Protocol"
    doc.save(DOCX_PATH)


def main() -> None:
    generate_walkthrough()
    build_docx()
    print(
        json.dumps(
            {
                "docx": str(DOCX_PATH),
                "gif": str(GIF_PATH),
                "thumbnail": str(THUMB_PATH),
                "docx_bytes": DOCX_PATH.stat().st_size,
                "gif_bytes": GIF_PATH.stat().st_size if GIF_PATH.exists() else 0,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
