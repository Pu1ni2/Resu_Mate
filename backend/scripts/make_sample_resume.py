"""Write frontend/public/sample-resume.pdf: a made-up person's résumé.

The sample shipped with the app used to be a real résumé, phone number and all.
This one is fiction: an @example.com address, a 555-01xx phone number (a range
kept for fiction), no links, and a line at the foot saying it is made up.

    python backend/scripts/make_sample_resume.py
"""
from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "sample-resume.pdf"

NAME = "Riley Samplewood"
TITLE = "Backend Software Engineer"
CONTACT = "riley.samplewood@example.com  |  (614) 555-0142  |  Columbus, OH"

SUMMARY = (
    "Backend engineer with 5 years of experience building Python APIs, data pipelines and "
    "internal tools. Comfortable owning a service from design to on-call, and mentoring "
    "newer engineers."
)

SKILLS = [
    ("Languages", "Python, SQL, TypeScript, Go (basic)"),
    ("Frameworks", "FastAPI, Django, Celery, React (basic)"),
    ("Data", "PostgreSQL, Redis, Kafka, Elasticsearch"),
    ("Infrastructure", "Docker, Kubernetes, AWS (ECS, S3, RDS), Terraform, CI/CD"),
    ("Practices", "REST API design, testing with pytest, code review, observability"),
]

EXPERIENCE = [
    ("Senior Software Engineer", "Brightwater Logistics, Columbus, OH", "Mar 2023 - Present", [
        "Led the rewrite of the shipment-tracking API in FastAPI, cutting p95 latency from 900 ms to 180 ms.",
        "Designed a Kafka event pipeline that processes 2 million status updates a day.",
        "Introduced contract tests and a staging environment; production incidents fell by 40%.",
        "Mentored three junior engineers through their first on-call rotations.",
    ]),
    ("Software Engineer", "Cobalt Ridge Software, Remote", "Jun 2021 - Feb 2023", [
        "Built Django services for a scheduling product used by 300 clinics.",
        "Moved background jobs to Celery and Redis, ending the nightly timeouts.",
        "Automated deployments with Docker and a CI pipeline, from weekly to daily releases.",
    ]),
    ("Software Engineering Intern", "Lakeview State University IT, Lakeview, OH", "May 2020 - Aug 2020", [
        "Wrote Python scripts to clean and migrate 50,000 student records to PostgreSQL.",
    ]),
]

EDUCATION = [("B.S. in Computer Science", "Lakeview State University", "2017 - 2021")]

PROJECTS = [
    "Rate limiter library: an open-source Python package for token-bucket rate limiting, "
    "with Redis and in-memory backends.",
]

NOTE = "Sample resume for trying ResuMate. The person, the companies and the school are made up."

ACCENT = (30, 64, 175)


def build() -> FPDF:
    pdf = FPDF(format="Letter")
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(auto=True, margin=16)
    # A fixed date, so the file only changes when its content does.
    pdf.set_creation_date(datetime(2026, 1, 1, tzinfo=timezone.utc))
    pdf.set_title(f"{NAME} - sample resume")
    pdf.set_author("ResuMate sample")
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.cell(0, 9, NAME, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 6, TITLE, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(60, 60, 60)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, CONTACT, new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    def heading(text):
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*ACCENT)
        pdf.cell(0, 6, text.upper(), new_x="LMARGIN", new_y="NEXT")
        pdf.set_draw_color(*ACCENT)
        pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
        pdf.ln(1.5)
        pdf.set_text_color(0, 0, 0)

    def paragraph(text):
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")

    def bullet(text):
        pdf.set_font("Helvetica", "", 10)
        pdf.set_x(pdf.l_margin + 2)
        pdf.cell(4, 5, "-")
        pdf.multi_cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")

    def dated(left, when):
        pdf.set_font("Helvetica", "B", 10)
        width = pdf.w - pdf.l_margin - pdf.r_margin
        pdf.cell(width - 40, 6, left)
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(40, 6, when, align="R", new_x="LMARGIN", new_y="NEXT")

    heading("Summary")
    paragraph(SUMMARY)

    heading("Skills")
    for label, items in SKILLS:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(30, 5, f"{label}:")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, items, new_x="LMARGIN", new_y="NEXT")

    heading("Experience")
    for title, where, when, points in EXPERIENCE:
        dated(f"{title} - {where}", when)
        for point in points:
            bullet(point)
        pdf.ln(1.5)

    heading("Education")
    for degree, school, when in EDUCATION:
        dated(f"{degree} - {school}", when)

    heading("Projects")
    for project in PROJECTS:
        bullet(project)

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(120, 120, 120)
    pdf.multi_cell(0, 4, NOTE, new_x="LMARGIN", new_y="NEXT")
    return pdf


if __name__ == "__main__":
    build().output(str(OUT))
    print(f"wrote {OUT}")
