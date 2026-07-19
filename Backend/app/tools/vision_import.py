"""extract_team_from_image — Phase 5's first real use of Gemini as this app's
multimodal specialist (see Docs/tech-stack.md's provider-mix rationale):
reads a screenshotted team sheet (a Showdown teambuilder screenshot, an
in-game party screen, or a hand-typed team list photo) and transcribes it
into plain Showdown export text, which then flows through the *exact same*
app/tools/team_import.py parser every pasted-text import already uses — this
tool only replaces the "how did the text get here" step, not team parsing
itself.

Best-effort by nature (OCR/vision transcription of a screenshot can misread
a name or a number) — the response is run through the same lenient
species-validation warnings as a normal paste import, so a misread shows up
as a visible warning rather than a silently wrong team.
"""

from langchain_core.messages import HumanMessage

from app.agent.llm import MissingProviderKeyError
from app.core.config import get_settings

VISION_MODEL = "gemini-2.5-flash"

EXTRACTION_PROMPT = """You are transcribing a screenshot of a competitive Pokemon team into \
Pokemon Showdown's plain-text team export format. Read every Pokemon visible in the image and \
output ONLY the Showdown export text (nickname, item, ability, Tera type, EVs, nature, moves — \
whatever is visible/inferable), one Pokemon per block separated by a blank line, in this shape:

Landorus-Therian @ Rocky Helmet
Ability: Intimidate
Tera Type: Water
EVs: 252 HP / 4 Def / 252 SpD
Careful Nature
- Earthquake
- U-turn
- Stealth Rock
- Taunt

If a field isn't visible in the image, omit that line rather than guessing. Do not include any \
commentary, headings, or text other than the export itself."""


def get_vision_llm():
    settings = get_settings()
    if not settings.google_api_key:
        raise MissingProviderKeyError("Google Gemini", "GOOGLE_API_KEY")
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=VISION_MODEL, api_key=settings.google_api_key, temperature=0
    )


async def extract_team_from_image(image_bytes: bytes, mime_type: str = "image/png") -> str:
    """Returns raw Showdown export text transcribed from the given image.
    Raises MissingProviderKeyError if GOOGLE_API_KEY isn't configured — see
    app/routers/team.py's POST /team/import-image, which turns that into a
    clean 503 rather than a guessed/mocked team."""
    import base64

    llm = get_vision_llm()
    encoded = base64.b64encode(image_bytes).decode("ascii")
    message = HumanMessage(
        content=[
            {"type": "text", "text": EXTRACTION_PROMPT},
            {"type": "image_url", "image_url": f"data:{mime_type};base64,{encoded}"},
        ]
    )
    response = await llm.ainvoke([message])
    return str(response.content).strip()
