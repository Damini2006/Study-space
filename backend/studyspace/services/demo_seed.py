"""Seeded demo workspace (one-click, no signup required).

The frontend creates/loads a demo account via Supabase Auth, then calls
``POST /demo/session`` which seeds (or resets) everything **as that user** —
RLS-scoped inserts only, no service-role key in the request path. Document
text is passed straight to the ingestion queue (no storage round-trip), so the
demo also demonstrates the real ingestion pipeline.
"""

from __future__ import annotations

import json
import random
from datetime import date, datetime, timedelta, timezone

from studyspace.config import get_settings
from studyspace.queue import enqueue_ingest

DEMO_SOURCES = [
    {
        "title": "Cell Biology — Foundations",
        "type": "markdown",
        "text": """# Cell Biology — Foundations

## Cell theory
All living organisms are made of cells, the basic unit of life. Cells arise only from pre-existing cells, and they carry out the processes that sustain life. Most cells are too small to see without a microscope; typical animal cells are about 10-30 micrometres across.

## Prokaryotic vs eukaryotic cells
Prokaryotic cells (bacteria and archaea) have no membrane-bound nucleus; their DNA floats in the cytoplasm in a region called the nucleoid. Eukaryotic cells (plants, animals, fungi and protists) store DNA inside a nucleus enclosed by a nuclear membrane.

## Organelles of the eukaryotic cell
- **Mitochondria** produce ATP through cellular respiration. A typical human liver cell contains 1000-2000 mitochondria.
- **Ribosomes** synthesise proteins by translating messenger RNA.
- **Endoplasmic reticulum** comes in rough (studded with ribosomes, folds proteins) and smooth (makes lipids, stores calcium) forms.
- **Golgi apparatus** modifies, sorts and packages proteins into vesicles for shipping.
- **Lysosomes** contain digestive enzymes that break down worn-out organelles and macromolecules; they function at an acidic pH of about 4.5.
- **Chloroplasts** (in plants and algae) convert light energy into chemical energy during photosynthesis.

## The plasma membrane
The cell membrane is a phospholipid bilayer about 7.5 nanometres thick. Phospholipids have hydrophilic heads facing outward and hydrophobic tails facing inward. Membrane proteins act as channels, pumps, receptors and anchors. The membrane is selectively permeable: small non-polar molecules such as oxygen and carbon dioxide cross freely, while ions and large polar molecules require transport proteins.

## Osmosis and tonicity
Osmosis is the net movement of water across a selectively permeable membrane from low solute concentration to high solute concentration. In a hypotonic solution a animal cell swells and may lyse; in a hypertonic solution it shrivels (crenation). Plant cells resist lysis because the cell wall counteracts the pressure of the swelling vacuole, producing turgor pressure.

## The cytoskeleton
The cytoskeleton is built from microfilaments (actin), intermediate filaments and microtubules (tubulin). It gives the cell shape, enables movement, and forms the spindle that separates chromosomes during cell division.

## Cell division
Mitosis produces two genetically identical daughter cells in four phases: prophase, metaphase, anaphase and telophase, followed by cytokinesis. Meiosis, by contrast, halves the chromosome number and produces four genetically unique gametes, and its two rounds of division are what generate genetic diversity through crossing over and independent assortment.
""",
    },
    {
        "title": "Photosynthesis & Respiration",
        "type": "markdown",
        "text": """# Photosynthesis and Cellular Respiration

## The photosynthesis equation
6CO2 + 6H2O + light energy -> C6H12O6 + 6O2. Photosynthesis takes place in chloroplasts and proceeds in two stages: the light-dependent reactions in the thylakoid membranes, and the light-independent reactions (Calvin cycle) in the stroma.

## Light-dependent reactions
Chlorophyll absorbs red and blue light most strongly and reflects green, which is why leaves look green. Water molecules are split (photolysis) to supply electrons, releasing oxygen as a by-product. The energy is stored as ATP and NADPH. Photosystems II and I pass electrons along an electron transport chain, and the proton gradient that forms across the thylakoid membrane drives ATP synthase (chemiosmosis).

## The Calvin cycle
The Calvin cycle fixes CO2 using the enzyme RuBisCO, attaching it to a 5-carbon sugar (RuBP) to make an unstable 6-carbon compound that splits into two 3-carbon molecules (3-PGA). ATP and NADPH from the light reactions reduce 3-PGA to G3P. For every 3 CO2 fixed, one net G3P leaves the cycle; six turns of the cycle are needed to build one glucose. RuBP is regenerated using more ATP.

## Factors limiting photosynthesis
Light intensity, carbon dioxide concentration and temperature all limit the rate of photosynthesis. The limiting factor is the one in shortest supply — increasing temperature beyond about 40 degrees Celsius denatures RuBisCO and the rate falls.

## Cellular respiration
C6H12O6 + 6O2 -> 6CO2 + 6O2 is wrong; the correct equation is C6H12O6 + 6O2 -> 6CO2 + 6H2O + ATP. Respiration releases the energy stored in glucose in three main stages.

### Glycolysis (cytoplasm)
One glucose (6C) is split into two pyruvate molecules (3C). It costs 2 ATP to start and yields 4 ATP (net 2 ATP) plus 2 NADH. Glycolysis does not require oxygen.

### Krebs cycle (mitochondrial matrix)
Each pyruvate is converted to acetyl-CoA, releasing CO2. The cycle produces 3 NADH, 1 FADH2 and 1 ATP (or GTP) per turn, so two turns per glucose give 6 NADH, 2 FADH2 and 2 ATP.

### Oxidative phosphorylation (inner mitochondrial membrane)
NADH and FADH2 donate electrons to the electron transport chain. Energy pumps protons into the intermembrane space, creating a gradient; protons flow back through ATP synthase, making ATP. Oxygen is the final electron acceptor and becomes water. This stage yields roughly 34 ATP per glucose, so about 36-38 ATP are produced per glucose in total.

## Comparing the two processes
Photosynthesis stores energy in glucose; respiration releases it. Chloroplasts only make sugars in the light, while mitochondria work day and night. Both rely on chemiosmosis across a membrane — thylakoids in chloroplasts pump protons outward, while the inner mitochondrial membrane pumps protons into the intermembrane space.
""",
    },
    {
        "title": "HTML & CSS Essentials",
        "type": "markdown",
        "text": """# HTML and CSS Essentials

## Document structure
A valid HTML5 document starts with <!DOCTYPE html>, then <html lang="en">, a <head> with <meta charset="utf-8"> and <title>, and a <body> holding the visible content. The charset declaration must come within the first 1024 bytes of the document to be effective.

## Semantics
Semantic elements describe meaning: <header>, <nav>, <main>, <article>, <section>, <footer>. Screen readers use them to build navigation landmarks, and search engines weigh them more than generic <div> boxes. Every image needs an <alt> attribute describing its content; decorative images use alt="".

## Links and media
<a href="/about"> creates a link; adding target="_blank" requires rel="noopener noreferrer" for security. <img src="cat.jpg" alt="A sleeping cat" width="640" height="480"> — providing width and height prevents layout shift (CLS). The <picture> element can serve different formats and sizes to different screens.

## The cascade: specificity
Inline style attributes score 1000, IDs score 100, classes/attributes/pseudo-classes score 10, and elements/pseudo-elements score 1. When selectors tie, the rule that appears later in the stylesheet wins. !important overrides everything except another !important, and should be avoided.

## Box model
Every element is a box: content, padding, border, margin. With the default box-sizing: content-box, width sets only the content box, so padding and border add to the total. Setting box-sizing: border-box makes width include padding and border, which is why most stylesheets apply it universally with the *, *::before, *::after rule.

## Layout
- **Flexbox** lays out items in one dimension. The container sets flex-direction (row or column), justify-content aligns along the main axis and align-items across the cross axis. Flex: 1 means grow 1, shrink 1, basis 0%.
- **Grid** lays out in two dimensions. grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) creates responsive columns without media queries. The 1fr unit is a share of the remaining free space.

## Positioning
Static is the default. Relative keeps the element in flow but offsets it, and its absolutely positioned children then measure from it. Absolute takes the element out of flow, positioning it against the nearest positioned ancestor or the viewport. Fixed positions it against the viewport, and sticky switches between relative and fixed as you scroll.

## Responsive design
Mobile-first means base styles target small screens, then min-width media queries add complexity. Relative units — rem for type, em for component-scoped sizing — respect user font preferences. The viewport meta tag <meta name="viewport" content="width=device-width, initial-scale=1"> is required or mobile browsers render a zoomed-out 980px canvas.

## Accessibility
Interactive elements must be reachable with Tab and operable with Enter/Space; use <button> instead of a clickable <div>. A :focus-visible style shows keyboard focus without showing it for mouse clicks. Contrast ratios of at least 4.5:1 are required for body text.
""",
    },
]

DEMO_CARDS = [
    ("What are the four phases of mitosis?",
     "Prophase, metaphase, anaphase and telophase, followed by cytokinesis.", ["biology"]),
    ("Where do the light-independent reactions of photosynthesis occur?",
     "In the stroma of the chloroplast (the Calvin cycle).", ["biology"]),
    ("What is the net ATP yield of glycolysis?",
     "2 ATP per glucose (4 produced minus 2 invested).", ["biology"]),
    ("What is the final electron acceptor in oxidative phosphorylation?",
     "Oxygen, which combines with electrons and protons to form water.", ["biology"]),
    ("Which HTML element is the primary container for main page content?",
     "<main> — it marks the dominant content of the document.", ["web"]),
    ("What does box-sizing: border-box change?",
     "Width includes padding and border instead of only the content box.", ["web"]),
    ("Why do leaves look green?",
     "Chlorophyll reflects green light while absorbing red and blue light most strongly.", ["biology"]),
    ("How does a plant cell avoid bursting in a hypotonic solution?",
     "Its cell wall counteracts swelling turgor pressure from the vacuole.", ["biology"]),
]

DEMO_NOTE = {
    "title": "Exam prep — week 1",
    "content": {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Plan"}]},
            {"type": "bullet_list", "content": [
                {"type": "list_item", "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": "Cell structure + membrane transport (Mon/Tue)"}]}]},
                {"type": "list_item", "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": "Photosynthesis + respiration (Wed/Thu)"}]}]},
                {"type": "list_item", "content": [{"type": "paragraph", "content": [
                    {"type": "text", "text": "HTML/CSS revision + practice quiz (Fri)"}]}]},
            ]},
        ],
    },
    "content_text": "Plan\n- Cell structure + membrane transport (Mon/Tue)\n- Photosynthesis + respiration (Wed/Thu)\n- HTML/CSS revision + practice quiz (Fri)",
    "tags": ["exam", "planning"],
}

DEMO_HABITS = [
    ("Read 30m", "#4F5BD5", 7),
    ("Exercise", "#E8749A", 4),
    ("Drink water", "#2FB5A0", 7),
]


async def seed_demo(user_id: str, conn) -> dict:
    """Seed the demo workspace using an already-authenticated user connection."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    space_id = await conn.fetchval(
        "insert into public.spaces (user_id, title, description, subject, color) values ($1, $2, $3, $4, $5) returning id",
        user_id,
        "Biology 101 — Demo",
        "Seeded demo Space with study notes. Upload your own documents anytime.",
        "Biology",
        "#4F5BD5",
    )

    ingest_jobs = []
    for src in DEMO_SOURCES:
        source_id = await conn.fetchval(
            "insert into public.sources (user_id, space_id, type, title, size_bytes, char_count, status) "
            "values ($1, $2, $3, $4, $5, $6, 'queued') returning id",
            user_id, space_id, src["type"], src["title"], len(src["text"].encode()), len(src["text"]),
        )
        ingest_jobs.append(
            dict(
                source_id=source_id,
                user_id=user_id,
                space_id=space_id,
                storage_path=None,
                file_type=src["type"],
                title=src["title"],
                pasted_text=src["text"],
            )
        )

    # flashcards + FSRS state (some due now, some later)
    for i, (front, back, tags) in enumerate(DEMO_CARDS):
        card_id = await conn.fetchval(
            "insert into public.cards (user_id, space_id, front, back, tags, origin) values ($1, $2, $3, $4, $5, 'ai') returning id",
            user_id, space_id, front, back, tags,
        )
        due = now + timedelta(days=(i % 4) - 1)  # 1 already due, others scheduled
        await conn.execute(
            "insert into public.card_state (user_id, card_id, due, stability, difficulty, state, reps, last_review) "
            "values ($1, $2, $3, $4, $5, $6, $7, $8)",
            user_id, card_id, due, 2.5 + (i % 3), 5.0,
            1 if i % 3 else 0, i % 3, now - timedelta(days=2) if i % 3 else None,
        )

    await conn.execute(
        "insert into public.notes (user_id, title, content, content_text, tags, color) values ($1, $2, $3, $4, $5, $6)",
        user_id, DEMO_NOTE["title"], json.dumps(DEMO_NOTE["content"]),
        DEMO_NOTE["content_text"], DEMO_NOTE["tags"], "#FFF9B3",
    )

    for name, color, target in DEMO_HABITS:
        habit_id = await conn.fetchval(
            "insert into public.habits (user_id, name, color, target_days) values ($1, $2, $3, $4) returning id",
            user_id, name, color, target,
        )
        for back in range(0, 24):
            day = date.today() - timedelta(days=back)
            if day.weekday() >= 5 and target < 7:
                continue
            if random.Random(f"{name}{day}").random() < 0.25:
                continue
            await conn.execute(
                "insert into public.habit_logs (user_id, habit_id, log_date) values ($1, $2, $3) "
                "on conflict (habit_id, log_date) do nothing",
                user_id, habit_id, day,
            )

    # focus history so Analytics/heatmap has real rows to show
    for back in range(0, 30):
        day = date.today() - timedelta(days=back)
        if day.weekday() >= 5 and back % 3:
            continue
        rng = random.Random(f"focus{day}")
        for session in range(rng.randint(0, 3)):
            minutes = rng.choice([25, 25, 45, 50])
            started = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(
                hours=9 + session * 3, minutes=rng.randint(0, 40)
            )
            await conn.execute(
                "insert into public.focus_sessions (user_id, space_id, kind, started_at, ended_at, duration_min, completed) "
                "values ($1, $2, 'focus', $3, $4, $5, true)",
                user_id, space_id, started, started + timedelta(minutes=minutes), minutes,
            )

    # sample approved plan
    plan_id = await conn.fetchval(
        "insert into public.plans (user_id, title) values ($1, $2) returning id",
        user_id, "Midterm study plan",
    )
    plan_tasks = [
        ("Review cell theory and organelles", "Cell structure", 1, 45),
        ("Practice membrane transport problems", "Osmosis", 2, 40),
        ("Map out the Calvin cycle from memory", "Photosynthesis", 3, 50),
        ("Compare respiration stages in a table", "Respiration", 5, 45),
        ("Revise HTML semantics and the cascade", "HTML/CSS", 6, 30),
        ("Mixed flashcard review session", "Mixed", 8, 25),
    ]
    for order, (title, topic, offset, minutes) in enumerate(plan_tasks):
        await conn.execute(
            "insert into public.plan_tasks (user_id, plan_id, title, topic, due, duration_min, space_id, status, source, order_idx, approved_at) "
            "values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'ai', $8, now())",
            user_id, plan_id, title, topic, date.today() + timedelta(days=offset),
            minutes, space_id, order,
        )

    # vision board (sticky goals) + finance history so the life modules demo well
    vision_seed = [
        ("Top 5 in class this term 🎯", "#FFF9B3", 40, 36),
        ("Ship my first project", "#FFD6E7", 300, 84),
        ("Study 25h / week", "#D9F5E5", 96, 220),
    ]
    for i, (text, color, x, y) in enumerate(vision_seed):
        await conn.execute(
            "insert into public.vision_items (user_id, kind, text, color, x, y, z_index) "
            "values ($1, 'sticky', $2, $3, $4, $5, $6)",
            user_id, text, color, x, y, i,
        )

    tx_seed = [
        ("Cafecito latte", 180, "expense", "Food", 0),
        ("Room rent share", 6500, "expense", "Housing", -2),
        ("Tuition refund", 3000, "income", "Income", -4),
        ("Bus pass", 450, "expense", "Transport", -6),
        ("Notebook + pens", 220, "expense", "Supplies", -9),
        ("Freelance logo gig", 2500, "income", "Income", -12),
    ]
    for title, amount, kind, category, offset in tx_seed:
        await conn.execute(
            "insert into public.transactions (user_id, title, amount, kind, category, spent_on) "
            "values ($1, $2, $3, $4, $5, $6)",
            user_id, title, amount, kind, category, date.today() + timedelta(days=offset),
        )

    queued = 0
    for job in ingest_jobs:
        try:
            await enqueue_ingest(**job)
            queued += 1
        except Exception:
            await conn.execute(
                "update public.sources set status = 'failed', error = $2 where id = $1",
                job["source_id"],
                "Background queue unavailable — start Redis to process demo sources.",
            )

    return {
        "space_id": str(space_id),
        "sources": len(DEMO_SOURCES),
        "ingest_queued": queued,
        "cards": len(DEMO_CARDS),
        "plan_tasks": len(plan_tasks),
        "reset": False,
    }


async def reset_user_data(user_id: str, conn) -> None:
    """Delete everything the user owns (demo reset / account deletion core)."""
    for table in (
        "planner_runs", "plans", "notes", "habits", "focus_sessions",
        "studio_outputs", "chat_threads", "spaces", "cards", "eval_results",
        "vision_items", "transactions",
    ):
        await conn.execute(f"delete from public.{table} where user_id = $1", user_id)
