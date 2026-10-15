from reportlab.pdfgen import canvas

c = canvas.Canvas("tests/fixtures/sample.pdf")
lines = [
    "DocQA Test Fixture",
    "",
    "This is a short test document used for automated end-to-end testing.",
    "The secret test keyword is: pineapple.",
    "This document has exactly one page and should be well under the 20 page limit.",
]
y = 750
for line in lines:
    c.drawString(50, y, line)
    y -= 24
c.save()