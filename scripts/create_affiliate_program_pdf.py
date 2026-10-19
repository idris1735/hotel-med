from pathlib import Path

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "hotel-medallion-affiliate-program.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

W, H = 900, 1165
M = 64

NAVY = HexColor("#202C83")
CYAN = HexColor("#00AEEF")
GOLD = HexColor("#C69200")
INK = HexColor("#292B35")
MUTED = HexColor("#626574")
PALE_BLUE = HexColor("#EFFAFF")
PALE_GOLD = HexColor("#FCF8EE")
PALE_LILAC = HexColor("#F3F4FA")
LINE = HexColor("#E3DDCF")
GREEN = HexColor("#407B3B")
WHITE = HexColor("#FFFFFF")

pdfmetrics.registerFont(TTFont("Georgia", r"C:\Windows\Fonts\georgia.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-Bold", r"C:\Windows\Fonts\georgiab.ttf"))
pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))


def style(name, font="Arial", size=15, color=INK, leading=None, align=TA_LEFT):
    return ParagraphStyle(
        name,
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.48,
        textColor=color,
        alignment=align,
        spaceAfter=0,
    )


BODY = style("body", size=15, color=MUTED, leading=23)
BODY_DARK = style("body-dark", size=15, color=INK, leading=23)
SMALL = style("small", size=11, color=MUTED, leading=16)
CARD_TITLE = style("card-title", font="Arial-Bold", size=15, color=INK, leading=19)
CARD_BODY = style("card-body", size=12.5, color=MUTED, leading=18)
WHITE_TITLE = style("white-title", font="Georgia", size=25, color=WHITE, leading=31)
WHITE_BODY = style("white-body", size=13, color=WHITE, leading=20)


def para(c, text, x, top, width, pstyle=BODY):
    p = Paragraph(text, pstyle)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, top - height)
    return top - height


def footer(c, page, label="Hotel Medallion - Affiliate Program"):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(M, 48, W - M, 48)
    c.setFont("Arial", 9)
    c.setFillColor(MUTED)
    c.drawString(M, 27, label)
    c.drawRightString(W - M, 27, f"{page:02d}")


def eyebrow(c, text, y=H - 60):
    c.saveState()
    t = c.beginText(M, y)
    t.setFont("Arial-Bold", 10)
    t.setFillColor(CYAN)
    t.setCharSpace(2.6)
    t.textLine(text.upper())
    c.drawText(t)
    c.restoreState()


def title(c, text, y, size=42):
    c.setFont("Georgia", size)
    c.setFillColor(NAVY)
    c.drawString(M, y, text)


def section(c, number, heading, y):
    c.setFont("Arial-Bold", 10)
    c.setFillColor(GOLD)
    c.drawString(M, y + 5, f"{number:02d}")
    c.setFont("Georgia", 27)
    c.setFillColor(NAVY)
    c.drawString(M + 32, y, heading)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(M, y - 20, W - M, y - 20)
    return y - 46


def rounded(c, x, y, w, h, fill, stroke=LINE, radius=14):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.8)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def card(c, x, top, w, h, heading, body, accent=CYAN, number=None):
    y = top - h
    rounded(c, x, y, w, h, WHITE)
    c.setFillColor(accent)
    c.roundRect(x, y, 5, h, 3, fill=1, stroke=0)
    tx = x + 22
    if number:
        c.setFont("Georgia", 19)
        c.setFillColor(accent)
        c.drawString(tx, top - 30, number)
        tx += 34
    para(c, heading, tx, top - 19, w - (tx - x) - 18, CARD_TITLE)
    para(c, body, x + 22, top - 48, w - 44, CARD_BODY)


def check_row(c, text, x, top, width):
    c.setFillColor(GREEN)
    c.circle(x + 7, top - 8, 7, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Arial-Bold", 8)
    c.drawCentredString(x + 7, top - 11, "OK")
    return para(c, text, x + 24, top, width - 24, BODY_DARK)


def arrow(c, x, y1, y2):
    c.setStrokeColor(INK)
    c.setFillColor(INK)
    c.setLineWidth(1.4)
    c.line(x, y1, x, y2 + 7)
    c.line(x, y2 + 7, x - 5, y2 + 14)
    c.line(x, y2 + 7, x + 5, y2 + 14)


c = Canvas(str(OUT), pagesize=(W, H))
c.setTitle("Hotel Medallion Affiliate Program")
c.setAuthor("Hotel Medallion")

# PAGE 1 - CLIENT-FRIENDLY OVERVIEW
eyebrow(c, "Hotel Medallion - Proposed System")
title(c, "The Affiliate Program", H - 125, 45)
para(
    c,
    "A simple way for approved travel agents, creators and business partners to earn a commission when they bring a paying guest to Hotel Medallion.",
    M,
    H - 170,
    W - 2 * M,
    style("intro", size=17, color=MUTED, leading=27),
)

y = section(c, 1, "What this means", H - 275)
rounded(c, M, y - 166, W - 2 * M, 152, NAVY, NAVY, 16)
para(c, "The idea in one sentence", M + 28, y - 30, 320, WHITE_TITLE)
para(
    c,
    "A partner shares a special Hotel Medallion link. If a guest uses that link, books, pays and completes the stay, the partner earns a commission.",
    M + 28,
    y - 72,
    W - 2 * M - 56,
    WHITE_BODY,
)

y2 = section(c, 2, "Who can become a partner", y - 215)
gap = 14
cw = (W - 2 * M - gap) / 2
card(c, M, y2, cw, 118, "Travel agents", "Agents who regularly arrange accommodation for individuals, groups or companies.", CYAN)
card(c, M + cw + gap, y2, cw, 118, "Corporate partners", "Companies, relocation firms and administrators who book stays for staff or visitors.", GOLD)
card(c, M, y2 - 134, cw, 118, "Creators and publishers", "Trusted travel, lifestyle and Lagos-focused creators with a relevant audience.", NAVY)
card(c, M + cw + gap, y2 - 134, cw, 118, "Event partners", "Wedding planners, conference organisers and vendors who refer guests needing rooms.", GREEN)

rounded(c, M, 93, W - 2 * M, 78, PALE_GOLD, LINE, 12)
para(c, "<b>Important:</b> the referral code identifies the partner. It does not automatically give the guest a discount unless the hotel chooses to add one.", M + 22, 147, W - 2 * M - 44, BODY_DARK)
footer(c, 1)
c.showPage()

# PAGE 2 - FLOW
eyebrow(c, "Hotel Medallion - Proposed System")
y = section(c, 3, "How it works", H - 108)
para(c, "The guest keeps using the same booking and Paystack payment process already on the website.", M, y, W - 2 * M, BODY)

node_x = 208
node_w = 484
node_h = 76
tops = [940, 820, 700, 580, 460, 340]
steps = [
    ("1", "Partner applies", "They submit their name, contact details and how they plan to promote the hotel.", PALE_BLUE),
    ("2", "Hotel approves the application", "Approved partners receive a unique referral link and code.", PALE_BLUE),
    ("3", "Partner shares the link", "The website remembers the referral for 30 days.", PALE_GOLD),
    ("4", "Guest books and pays", "The booking is tagged with the correct partner automatically.", PALE_GOLD),
    ("5", "Guest completes the stay", "Cancelled, refunded and no-show bookings do not earn commission.", PALE_LILAC),
    ("6", "Commission is approved and paid", "Approved commissions are paid monthly to the partner's Nigerian bank account.", PALE_LILAC),
]
for i, (num, head, body, fill) in enumerate(steps):
    top = tops[i]
    rounded(c, node_x, top - node_h, node_w, node_h, fill, NAVY, 12)
    c.setFillColor(NAVY if i < 4 else GOLD)
    c.circle(node_x + 38, top - 38, 18, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Arial-Bold", 12)
    c.drawCentredString(node_x + 38, top - 42, num)
    para(c, head, node_x + 70, top - 16, node_w - 90, CARD_TITLE)
    para(c, body, node_x + 70, top - 42, node_w - 90, CARD_BODY)
    if i < len(steps) - 1:
        arrow(c, W / 2, top - node_h, tops[i + 1] + 7)

rounded(c, M, 92, W - 2 * M, 92, WHITE, LINE, 12)
para(c, "<b>The safeguard:</b> payment creates a <b>pending</b> commission. The commission becomes payable only after the stay is completed and the booking has not been refunded.", M + 24, 158, W - 2 * M - 48, BODY_DARK)
footer(c, 2)
c.showPage()

# PAGE 3 - SIMPLE RULES
eyebrow(c, "Hotel Medallion - Recommended Rules")
y = section(c, 4, "Simple rules for launch", H - 108)
para(c, "These are recommended starting terms. Management can change them before the programme goes live.", M, y, W - 2 * M, BODY)

left = M
right = W / 2 + 10
col_w = W / 2 - M - 24
card(c, left, 945, col_w, 132, "Commission", "Start at <b>5% of room revenue</b>. Do not calculate commission on taxes, payment charges or extras.", CYAN, "01")
card(c, right, 945, col_w, 132, "Tracking period", "Keep the referral active for <b>30 days</b> after the guest first follows the partner's link.", GOLD, "02")
card(c, left, 793, col_w, 132, "Approval point", "Mark commission pending after payment and approve it only after checkout plus a short dispute period.", NAVY, "03")
card(c, right, 793, col_w, 132, "Payout", "Pay monthly to a verified Nigerian bank account, with a suggested minimum balance of <b>NGN 25,000</b>.", GREEN, "04")

y = section(c, 5, "Bookings that do not earn commission", 602)
yy = y
for text in [
    "Cancelled, refunded or charged-back reservations",
    "No-shows and unpaid reservations",
    "Fraudulent bookings or false referrals",
    "Self-referrals unless management approves them",
    "Bookings that were already in progress before the referral",
]:
    yy = check_row(c, text, M + 8, yy, W - 2 * M - 16) - 12

rounded(c, M, 98, W - 2 * M, 112, PALE_BLUE, LINE, 12)
para(c, "<b>Example:</b> on a NGN 85,000 room night, a 5% commission is NGN 4,250. The exact rate should be confirmed against the hotel's operating margin before launch.", M + 24, 178, W - 2 * M - 48, BODY_DARK)
footer(c, 3)
c.showPage()

# PAGE 4 - REAL-WORLD OPTIONS
eyebrow(c, "Hotel Medallion - Available Options")
y = section(c, 6, "Real-world programme options", H - 108)

rounded(c, M, 850, W - 2 * M, 150, NAVY, NAVY, 15)
para(c, "Recommended now: build it into Hotel Medallion", M + 26, 968, 600, WHITE_TITLE)
para(c, "Use the current website, booking database and Paystack payment flow. Add partner applications, referral tracking, a commission ledger and monthly reports. Paystack Transfers can later send approved payouts to Nigerian bank accounts.", M + 26, 922, W - 2 * M - 52, WHITE_BODY)

card(c, M, 820, W - 2 * M, 126, "Tapfiliate - ready-made affiliate software", "Useful if the hotel wants partner logins and dashboards immediately. It supports links, coupon attribution, reporting and API integration. Nigerian payouts can still be handled separately through Paystack.", CYAN)
card(c, M, 674, W - 2 * M, 126, "Awin - international publisher network", "Useful later when the hotel wants access to a large network of publishers and international affiliates. It has monthly and transaction fees, and Nigerian advertiser onboarding should be confirmed first.", GOLD)
card(c, M, 528, W - 2 * M, 126, "impact.com - enterprise partnership platform", "Strong tracking and partner-management tools, but marketplace access is priced for larger programmes. It is not the economical first step for one hotel.", NAVY)

rounded(c, M, 124, W - 2 * M, 228, PALE_GOLD, LINE, 14)
para(c, "Best fit for Hotel Medallion", M + 24, 324, W - 2 * M - 48, style("fit-title", font="Georgia", size=23, color=NAVY, leading=28))
fit_y = 282
for text in [
    "Launch the private Hotel Medallion programme first.",
    "Use Paystack for Nigerian payments and future bank payouts.",
    "Consider Tapfiliate only if a self-service partner dashboard is required immediately.",
    "Consider Awin or impact.com only after the programme proves meaningful sales volume.",
]:
    fit_y = check_row(c, text, M + 26, fit_y, W - 2 * M - 52) - 9
footer(c, 4)
c.showPage()

# PAGE 5 - RECRUITMENT + DELIVERY
eyebrow(c, "Hotel Medallion - Recommended Rollout")
y = section(c, 7, "Where the partners will come from", H - 108)
para(c, "Affiliate software tracks bookings; it does not automatically create relationships. The hotel still needs a recruitment plan.", M, y, W - 2 * M, BODY)

card(c, M, 936, 368, 126, "NANTA agencies", "Invite selected Nigerian travel agencies to join Hotel Medallion's private programme and use their own referral links.", CYAN)
card(c, 468, 936, 368, 126, "Wakanow", "Explore listing Hotel Medallion in its accommodation inventory so its Nigerian agents and affiliates can sell the property.", GOLD)
card(c, M, 790, 368, 126, "Booking.com and Expedia", "Treat these as distribution channels connected through Biodux, not as replacements for the hotel's private programme.", NAVY)
card(c, 468, 790, 368, 126, "Local direct partners", "Recruit corporate administrators, relocation firms, wedding planners, event organisers and trusted Lagos creators.", GREEN)

y = section(c, 8, "Recommended rollout", 612)
phase_w = (W - 2 * M - 28) / 3
for i, (label, head, body, fill) in enumerate([
    ("PHASE 1", "Launch", "Application, approval, referral links, tracking and monthly report.", PALE_BLUE),
    ("PHASE 2", "Connect", "Use Biodux status to confirm completed stays and cancellations.", PALE_GOLD),
    ("PHASE 3", "Automate", "Add partner dashboards, tiers and Paystack Transfers when volume justifies it.", PALE_LILAC),
]):
    x = M + i * (phase_w + 14)
    rounded(c, x, 350, phase_w, 190, fill, LINE, 13)
    c.setFont("Arial-Bold", 9)
    c.setFillColor(CYAN if i == 0 else GOLD if i == 1 else NAVY)
    c.saveState()
    phase_label = c.beginText(x + 18, 510)
    phase_label.setFont("Arial-Bold", 9)
    phase_label.setFillColor(CYAN if i == 0 else GOLD if i == 1 else NAVY)
    phase_label.setCharSpace(1.7)
    phase_label.textLine(label)
    c.drawText(phase_label)
    c.restoreState()
    para(c, head, x + 18, 484, phase_w - 36, style(f"phase-{i}", font="Georgia", size=22, color=NAVY, leading=26))
    para(c, body, x + 18, 445, phase_w - 36, CARD_BODY)

rounded(c, M, 88, W - 2 * M, 218, WHITE, LINE, 14)
para(c, "Management decisions needed", M + 24, 278, 420, style("decision-title", font="Georgia", size=23, color=NAVY, leading=28))
dec_y = 237
for text in [
    "Confirm the commission rate.",
    "Confirm the monthly payout date and minimum balance.",
    "Name the person or inbox that approves applications.",
    "Confirm which booking status Biodux will send after checkout.",
]:
    dec_y = check_row(c, text, M + 26, dec_y, W - 2 * M - 52) - 7
footer(c, 5)
c.showPage()

# PAGE 6 - SOURCES
eyebrow(c, "Hotel Medallion - Reference Notes")
y = section(c, 9, "Verified services referenced", H - 108)
para(c, "Service availability and pricing were checked on 28 September 2026. Commercial terms can change and should be reconfirmed before signing.", M, y, W - 2 * M, BODY)

sources = [
    ("Paystack Transfers", "Nigerian business transfers, single and bulk payouts", "paystack.com/docs/transfers", "https://paystack.com/docs/transfers/"),
    ("Tapfiliate", "Affiliate tracking, API and payout-management features", "tapfiliate.com/pricing", "https://tapfiliate.com/pricing"),
    ("Awin", "Advertiser plans and publisher network", "awin.com/gb/pricing/advertisers", "https://www.awin.com/gb/pricing/advertisers"),
    ("impact.com", "Partnership platform plans and marketplace access", "impact.com/integrated-platform-prices", "https://impact.com/integrated-platform-prices/"),
    ("Wakanow Affiliates", "Nigerian travel and hotel affiliate ecosystem", "affiliates.wakanow.com", "https://affiliates.wakanow.com/"),
    ("Expedia TAAP", "Travel-agent booking and commission programme", "partner.expediagroup.com", "https://partner.expediagroup.com/en-us/solutions/build-your-travel-experience/travel-agent-affiliate-program"),
    ("Booking.com", "Affiliate network and accommodation distribution", "booking.com/affiliate-program", "https://bookitbutton.booking.com/affiliate-program/v2/index.en-gb.html"),
    ("NANTA", "Nigerian travel-agency membership network", "member.nanta.org.ng", "https://member.nanta.org.ng/register"),
]
sy = 952
for idx, (name, desc, display_url, url) in enumerate(sources, 1):
    rounded(c, M, sy - 78, W - 2 * M, 66, WHITE, LINE, 9)
    c.setFillColor(NAVY)
    c.circle(M + 25, sy - 45, 13, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Arial-Bold", 9)
    c.drawCentredString(M + 25, sy - 48, str(idx))
    para(c, name, M + 48, sy - 19, 230, CARD_TITLE)
    para(c, desc, M + 48, sy - 43, 330, SMALL)
    c.setFillColor(CYAN)
    c.setFont("Arial", 8.2)
    c.drawRightString(W - M - 16, sy - 46, display_url)
    c.linkURL(url, (M, sy - 78, W - M, sy - 12), relative=0)
    sy -= 91

rounded(c, M, 88, W - 2 * M, 92, PALE_BLUE, LINE, 12)
para(c, "This document explains the recommended operating model. Final commercial terms should be approved by Hotel Medallion before development begins.", M + 24, 153, W - 2 * M - 48, BODY_DARK)
footer(c, 6, "Hotel Medallion - Affiliate Program | Draft for management review")
c.save()
print(OUT)
