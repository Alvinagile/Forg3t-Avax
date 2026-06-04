from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "grant-review"
OUT_PDF = OUT_DIR / "forg3t-avalanche-phase2-grant-manager-packet.pdf"

APP_URL = "https://buildgames.forg3t.io"
PUBLIC_VERIFY_URL = "https://buildgames.forg3t.io/verify/212a028eabcac5e2c3458cc9f219259d"
SUPABASE_VERIFY_URL = (
    "https://xewxfsdrtqpthkpbhbzp.supabase.co/functions/v1/"
    "verify-evidence?token=212a028eabcac5e2c3458cc9f219259d"
)
SNOWTRACE_TX_URL = (
    "https://snowtrace.io/tx/"
    "0x7af8b0376079571f2a4ff46ff76e6cdfb27f710ea4b2434c41bfdf25a167e7be"
)
SNOWTRACE_CONTRACT_URL = "https://snowtrace.io/address/0x20E772a60CEE7D8E6706E698B129FD917c3936bf"


def esc(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def link(url: str, label: str | None = None) -> str:
    label = label or url
    return f'<link href="{esc(url)}"><font color="#0B57D0"><u>{esc(label)}</u></font></link>'


def p(text: str, style: ParagraphStyle):
    return Paragraph(text, style)


def bullet_list(items: list[str], styles):
    return ListFlowable(
        [ListItem(Paragraph(esc(item), styles["Body"]), leftIndent=12) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=18,
        bulletFontSize=7,
    )


def kv_table(rows: list[tuple[str, str]], styles, widths=(1.65 * inch, 4.95 * inch)):
    data = [[Paragraph(f"<b>{esc(k)}</b>", styles["Small"]), Paragraph(v, styles["Small"])] for k, v in rows]
    table = Table(data, colWidths=list(widths), hAlign="LEFT", repeatRows=0)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def matrix_table(headers: list[str], rows: list[list[str]], styles, widths: list[float]):
    data = [[Paragraph(f"<b>{esc(h)}</b>", styles["HeaderCell"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(esc(value), styles["Small"]) for value in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def build() -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT_PDF),
        pagesize=LETTER,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title="Forg3t Protocol Avalanche Phase 2 Grant Manager Packet",
        author="Forg3t Protocol",
    )

    base = getSampleStyleSheet()
    styles = {
        "Title": ParagraphStyle(
            "PacketTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=21,
            leading=25,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#111827"),
            spaceAfter=8,
        ),
        "Subtitle": ParagraphStyle(
            "PacketSubtitle",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=10,
            leading=13,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#374151"),
            spaceAfter=4,
        ),
        "H1": ParagraphStyle(
            "PacketH1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=colors.HexColor("#E84142"),
            spaceBefore=14,
            spaceAfter=7,
        ),
        "H2": ParagraphStyle(
            "PacketH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#1F2937"),
            spaceBefore=9,
            spaceAfter=5,
        ),
        "Body": ParagraphStyle(
            "PacketBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=12.2,
            textColor=colors.HexColor("#111827"),
            spaceAfter=6,
        ),
        "Small": ParagraphStyle(
            "PacketSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.7,
            leading=9.6,
            textColor=colors.HexColor("#111827"),
            wordWrap="CJK",
        ),
        "HeaderCell": ParagraphStyle(
            "HeaderCell",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.8,
            leading=9.4,
            textColor=colors.white,
        ),
        "Code": ParagraphStyle(
            "PacketCode",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.4,
            leading=9.2,
            textColor=colors.HexColor("#111827"),
            backColor=colors.HexColor("#F3F4F6"),
            borderColor=colors.HexColor("#E5E7EB"),
            borderWidth=0.3,
            borderPadding=5,
            wordWrap="CJK",
        ),
    }

    story = [
        p("Forg3t Protocol Avalanche Grant Phase 2", styles["Title"]),
        p("Grant Manager Review Packet | Code-Side Evidence and Live Demo Access", styles["Subtitle"]),
        p("Prepared: 2026-05-24 | Network: Avalanche C-Chain mainnet | Status: code-side review ready", styles["Subtitle"]),
        Spacer(1, 10),
        p("Executive Summary", styles["H1"]),
        p(
            "Forg3t Protocol now has a reviewable Phase 2 product implementation for black-box AI suppression/unlearning evidence workflows. "
            "The repository-controlled milestones have been implemented or strengthened across frontend, Supabase backend, database/RBAC, "
            "Avalanche anchoring, reports, pipelines, API integrations, tests, documentation, and dependency audit posture.",
            styles["Body"],
        ),
        p(
            "This packet intentionally does not claim enterprise pilot approval, customer attestation, real customer usage, founder sales material, "
            "or recorded demo completion. Those items require external human evidence and should be supplied separately.",
            styles["Body"],
        ),
        p("Live Review Access", styles["H1"]),
        kv_table(
            [
                ("Production app", link(APP_URL)),
                ("Reviewer email", "grant-reviewer@forg3t.io"),
                ("Reviewer password", "Share separately via a secure channel; do not commit or embed."),
                ("Reviewer role", "admin on the Phase 2 review project"),
                ("Public verify route", link(PUBLIC_VERIFY_URL)),
                ("Public API verify", link(SUPABASE_VERIFY_URL)),
                ("Snowtrace transaction", link(SNOWTRACE_TX_URL)),
            ],
            styles,
        ),
        Spacer(1, 6),
        p("Security note: this reviewer account is intended only for grant review. Rotate or delete it after the review window.", styles["Body"]),
        p("Primary Evidence Record", styles["H1"]),
        kv_table(
            [
                ("Job ID", "9a2a77cf-4b09-4f59-be04-c18b08b137bd"),
                ("Evidence ID", "608a427f-25c1-4f43-b3e7-d9a86ff33801"),
                ("Evidence hash", "0x1c01887f16bc967d3e53042db25c8cfe2ad9611222a1b7a2f8326190061b4b0b"),
                ("Job hash", "0x9b7077f20c7a481b176684181bc7c28cab90a96d93ce73463dccfe12ccef649e"),
                ("Anchor status", "confirmed"),
                ("Network", "mainnet"),
                ("Chain ID", "43114"),
                ("Block number", "86276105"),
                ("Contract", "0x20E772a60CEE7D8E6706E698B129FD917c3936bf"),
                ("Transaction", "0x7af8b0376079571f2a4ff46ff76e6cdfb27f710ea4b2434c41bfdf25a167e7be"),
            ],
            styles,
            widths=(1.35 * inch, 5.25 * inch),
        ),
        PageBreak(),
        p("Milestone Completion Matrix", styles["H1"]),
        matrix_table(
            ["Milestone", "Status", "Evidence"],
            [
                ["Evidence anchoring", "Completed", "Job to evidence hash to Avalanche mainnet anchor to verification result. Tx hash, network, block, contract, and Snowtrace link are visible."],
                ["Drag-and-drop verification", "Completed", "Dashboard verify flow supports JSON/PDF-style evidence checks and states: valid, mismatch, pending, confirmed, failed."],
                ["Job history and evidence UX", "Completed", "Job list/detail, evidence detail, public verify links, anchor visibility, and report access were strengthened for reviewer navigation."],
                ["Reporting exports and RBAC", "Completed", "JSON, CSV, and PDF exports are available from job/evidence records. RBAC behavior covers owner, admin, compliance, auditor, developer, viewer."],
                ["Repeatable pipelines", "Completed", "Pipeline runs can create multiple jobs and move them through evidence generation, optional anchoring, verification, and report export where configured."],
                ["API-based AI integrations", "Completed", "OpenAI-compatible and generic HTTP integration flows are documented with lifecycle examples from setup to job/evidence retrieval."],
                ["Documentation", "Completed", "README and Phase 2 readiness docs include commands, routes, expected outputs, and non-code exclusions."],
                ["Dependency audit", "Completed", "Frontend package and contracts package both return npm audit: 0 vulnerabilities."],
            ],
            styles,
            [1.45 * inch, 0.9 * inch, 4.25 * inch],
        ),
        p("Reviewer Walkthrough", styles["H1"]),
        bullet_list(
            [
                "Open the production app and sign in with the reviewer account above.",
                "Go to Jobs and open the completed Phase 2 smoke job.",
                "Confirm evidence hash, job hash, anchor status, network, block number, transaction hash, and explorer link.",
                "Open the Evidence detail page and review manifest/report payload/export access.",
                "Open the public verify route and confirm Anchor Confirmed on mainnet.",
                "Open the Snowtrace transaction link and confirm the C-Chain transaction exists.",
                "Use Verify to test evidence JSON/PDF drag-and-drop verification states.",
                "Open Pipelines to inspect repeatable pipeline run support.",
            ],
            styles,
        ),
        p("Review Links", styles["H1"]),
        p(f"<b>Production app:</b> {link(APP_URL)}", styles["Body"]),
        p(f"<b>Public evidence verification page:</b> {link(PUBLIC_VERIFY_URL)}", styles["Body"]),
        p(f"<b>Public verify Edge Function:</b> {link(SUPABASE_VERIFY_URL)}", styles["Body"]),
        p(f"<b>Avalanche mainnet transaction:</b> {link(SNOWTRACE_TX_URL)}", styles["Body"]),
        p(f"<b>Avalanche contract address:</b> {link(SNOWTRACE_CONTRACT_URL)}", styles["Body"]),
        PageBreak(),
        p("Commands and Verification Outputs", styles["H1"]),
        matrix_table(
            ["Command", "Result"],
            [
                ["npm audit", "0 vulnerabilities in project package"],
                ["npm test", "4 test files passed, 15 tests passed"],
                ["npm run lint", "Passed"],
                ["npm run build", "Passed with Vite 8 production build"],
                ["cd contracts; npm audit", "0 vulnerabilities in contracts package"],
                ["cd contracts; npm run compile", "Passed with Node 22.13+ / Node 24 runtime"],
                ["contracts local deploy smoke", "Passed on local Hardhat simulated network"],
            ],
            styles,
            [2.6 * inch, 4.0 * inch],
        ),
        p("Repository Evidence Files", styles["H1"]),
        bullet_list(
            [
                "README.md and project/README.md",
                "project/docs/phase2-readiness.md",
                "project/docs/api/evidenceAnchoring.md",
                "project/scripts/phase2-smoke.mjs",
                "project/supabase/functions/anchors/index.ts",
                "project/supabase/functions/verify-evidence/index.ts",
                "project/supabase/functions/jobs/index.ts",
                "project/supabase/functions/pipelines/index.ts",
                "project/supabase/functions/reports/index.ts",
                "project/supabase/functions/integrations/index.ts",
                "project/contracts/contracts/ForgEvidenceAnchor.sol",
                "project/contracts/hardhat.config.ts",
                "project/shared/workflows.test.ts and project/src/lib/domainUtils.test.ts",
            ],
            styles,
        ),
        p("Explicit Non-Code Exclusions", styles["H1"]),
        p("The following items are not claimed as completed in this repository packet because they require external proof or manual review artifacts:", styles["Body"]),
        bullet_list(
            [
                "Enterprise pilot approval",
                "Customer attestation",
                "Real customer usage evidence",
                "Founder/sales material",
                "Recorded demo/video",
                "Optional Snowtrace contract source verification, if the reviewer requests it separately",
            ],
            styles,
        ),
        p("Known Review Risks", styles["H1"]),
        bullet_list(
            [
                "Black-box suppression verification is supported; internal model-weight deletion is not claimed unless an integration supplies verifiable internal evidence.",
                "Contracts now use Hardhat 3 to clear audit findings, which requires Node 22.13.0 or newer.",
                "Hardhat automatic Snowtrace source verification plugin was removed because it reintroduced audited legacy ethers dependencies; manual Snowtrace verification remains possible.",
                "The reviewer account is live and should be rotated after review.",
            ],
            styles,
        ),
        p("Final Code-Side Readiness Statement", styles["H1"]),
        p(
            "All repository-controlled Phase 2 product and code milestones are implemented or strengthened. "
            "Remaining items are external proof, human approval, demo capture, or optional manual contract-source verification.",
            styles["Body"],
        ),
    ]

    doc.build(story)
    return OUT_PDF


if __name__ == "__main__":
    print(build())
