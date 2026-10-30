import re
from typing import Callable, List, Optional
from app.schemas import ChatMessage

# Token-aware greeting patterns supporting repeated characters (e.g. hii, hiiii, heyy, hellooo)
GREETING_TOKEN_PATTERNS = {
    "hi": re.compile(r"^h+i+$"),
    "hey": re.compile(r"^h+e+y+$"),
    "hello": re.compile(r"^h+e+l+l*o+$"),
    "heya": re.compile(r"^h+e+y+[ao]+$"),
    "hiya": re.compile(r"^h+i+y+a+$"),
    "howdy": re.compile(r"^h+o+w+d+y+$"),
    "yo": re.compile(r"^y+o+$"),
    "sup": re.compile(r"^s+u+p+$"),
}

# Addressed names and fillers that can accompany pure greetings
ALLOWED_ADDRESSING = {
    "there",
    "october",
    "octoberai",
    "ai",
    "friend",
    "buddy",
    "companion",
    "assistant",
    "bot",
    "team",
    "folks",
    "everyone",
    "all",
}

# Conversational pleasantries that can accompany a greeting
ALLOWED_PLEASANTRIES = [
    ["how", "are", "you"],
    ["how", "are", "you", "doing"],
    ["hows", "it", "going"],
    ["how", "is", "it", "going"],
    ["how", "are", "things"],
    ["whats", "up"],
    ["what", "s", "up"],
    ["whats", "new"],
    ["hope", "all", "is", "well"],
    ["hope", "you", "are", "well"],
    ["hope", "you", "are", "doing", "well"],
]

# Emoticons and emojis regex patterns
EMOTICONS_RE = re.compile(
    r"[:;=8][\-o\*\']?[)\]DdpP3\(\[/\\:\}\{@|]|[)\]DdpP3\(\[/\\:\}\{@|][\-o\*\']?[:;=8]|\^_\^|\^\^|<3"
)
EMOJI_RE = re.compile(r"[\U00010000-\U0010ffff\u2600-\u27bf\ufe00-\ufe0f\u200d]+")
PUNCT_RE = re.compile(r"[^\w\s]")
WHITESPACE_RE = re.compile(r"\s+")

# Varied, natural general greeting responses (distinct from the initial welcome message)
GREETING_RESPONSES_GENERAL = [
    "Hi! What are we working on?",
    "Hey! Good to hear from you.",
    "Hello! How's it going?",
    "Hey there! What's up?",
]

# Base index mapping for deterministic greeting selection
GREETING_TYPE_BASE_INDEX = {
    "hi": 0,
    "hey": 1,
    "heya": 1,
    "hello": 2,
    "sup": 3,
    "yo": 3,
    "howdy": 0,
    "hiya": 1,
}

# Pure identity queries
IDENTITY_PATTERNS = {
    "who are you",
    "what is octoberai",
    "what is october ai",
    "what is your name",
    "what are you",
    "tell me about yourself",
    "introduce yourself",
    "what should i call you",
    "who made you",
}

# Pure capability queries
CAPABILITY_PATTERNS = {
    "what can you do",
    "how can you help me",
    "what are your features",
    "what are your capabilities",
    "what do you do",
    "what can i ask you",
    "how do you help",
    "what can you help with",
}

# Acknowledgements & affirmations
THANKS_PATTERNS = {
    "thanks",
    "thank you",
    "thank you so much",
    "thanks a lot",
    "thx",
    "ty",
    "many thanks",
}

AFFIRMATION_PATTERNS = {
    "ok",
    "okay",
    "ok cool",
    "cool",
    "great",
    "awesome",
    "nice",
    "got it",
    "understood",
    "perfect",
    "sounds good",
    "alright",
    "cheers",
    "noted",
}

# Farewells
FAREWELL_PATTERNS = {
    "bye",
    "goodbye",
    "see you",
    "see you later",
    "see ya",
    "cya",
    "catch you later",
    "talk to you later",
    "have a good day",
    "have a good one",
}

NIGHT_PATTERNS = {
    "good night",
    "goodnight",
    "night",
    "sleep well",
}

# Help and desktop UI questions
HELP_PATTERNS = {
    "help",
    "how do i use this",
    "how to use this",
    "how does this work",
    "how does this app work",
    "how do i use octoberai",
    "how to use octoberai",
    "how do i pin this",
    "how to pin",
    "how to collapse",
    "how do i collapse",
    "how to close",
    "how do i close this",
    "shortcuts",
    "keyboard shortcuts",
}

# Follow-up prompts
FOLLOWUP_PATTERNS = {
    "tell me more",
    "tell me more about that",
    "tell me more please",
    "more details",
    "can you elaborate",
    "elaborate",
    "can you explain more",
    "give me more details",
}


def normalize_text(text: str) -> str:
    """Normalizes input text by lowercasing, stripping punctuation, and collapsing whitespace."""
    t = text.lower()
    t = t.replace("what's", "whats").replace("how's", "hows")
    t = EMOTICONS_RE.sub(" ", t)
    t = EMOJI_RE.sub(" ", t)
    no_punct = PUNCT_RE.sub(" ", t)
    return WHITESPACE_RE.sub(" ", no_punct).strip()


def tokenize(text: str) -> List[str]:
    """Tokenizes text into lowercase words while stripping emoticons, emojis, and punctuation."""
    norm = normalize_text(text)
    return [w for w in norm.split() if w]


def detect_pure_greeting(text: str) -> Optional[str]:
    """
    Detects if the input is purely a greeting.
    Returns the canonical greeting type (e.g. 'hi', 'hey', 'hello', 'sup', 'morning', etc.),
    or None if the message is NOT a greeting or contains a complex inquiry/task.
    """
    tokens = tokenize(text)
    if not tokens:
        return None

    greeting_type: Optional[str] = None
    greeting_len: int = 0

    # Multi-word greetings
    if len(tokens) >= 2 and tokens[0] == "good":
        if re.match(r"^m+o+r+n+i+n+g*$", tokens[1]):
            greeting_type, greeting_len = "morning", 2
        elif tokens[1].startswith("afternoon"):
            greeting_type, greeting_len = "afternoon", 2
        elif tokens[1].startswith("evening"):
            greeting_type, greeting_len = "evening", 2
    elif len(tokens) >= 2 and (tokens[:2] == ["whats", "up"] or tokens[:2] == ["what", "up"]):
        greeting_type, greeting_len = "sup", 2
    elif len(tokens) >= 3 and tokens[:3] == ["what", "s", "up"]:
        greeting_type, greeting_len = "sup", 3
    elif tokens[0] in {"wassup", "wazzup"}:
        greeting_type, greeting_len = "sup", 1
    elif tokens[0].startswith("greeting"):
        greeting_type, greeting_len = "hello", 1
    else:
        # Single-token greeting pattern matching
        for root, pat in GREETING_TOKEN_PATTERNS.items():
            if pat.match(tokens[0]):
                greeting_type, greeting_len = root, 1
                break

    if not greeting_type:
        return None

    remainder = tokens[greeting_len:]
    if not remainder:
        return greeting_type

    # Strip leading addressing / filler words
    sub = remainder[:]
    while sub and sub[0] in ALLOWED_ADDRESSING:
        sub = sub[1:]

    if not sub:
        return greeting_type

    if sub in ALLOWED_PLEASANTRIES:
        return greeting_type

    # Contains substantive task or question words (e.g. 'explain neural networks', 'write python code')
    return None


def select_greeting_response(
    greeting_type: str,
    messages: List[ChatMessage],
    selector: Optional[Callable[[List[str], int], str]] = None,
) -> str:
    """
    Selects a natural, concise greeting response deterministically or via an injected selector.
    Ensures responses are varied across greetings and distinct from the welcome message.
    """
    if greeting_type == "morning":
        return "Good morning! What are we working on today?"
    if greeting_type == "afternoon":
        return "Good afternoon! How's your day going?"
    if greeting_type == "evening":
        return "Good evening! How can I help you today?"

    if selector is not None:
        return selector(GREETING_RESPONSES_GENERAL, len(messages))

    # Deterministic index based on greeting type and count of prior user messages
    prior_user_turns = sum(1 for m in messages if m.role == "user") - 1
    if prior_user_turns < 0:
        prior_user_turns = 0

    base_idx = GREETING_TYPE_BASE_INDEX.get(greeting_type, 0)
    idx = (base_idx + prior_user_turns) % len(GREETING_RESPONSES_GENERAL)
    return GREETING_RESPONSES_GENERAL[idx]


def is_pure_farewell(normalized: str) -> bool:
    """Checks if normalized text is purely a farewell."""
    if normalized in FAREWELL_PATTERNS or normalized in NIGHT_PATTERNS:
        return True
    for pat in FAREWELL_PATTERNS:
        if normalized == pat or normalized == f"{pat} octoberai":
            return True
    for pat in NIGHT_PATTERNS:
        if normalized == pat or normalized == f"{pat} octoberai":
            return True
    return False


def get_local_response(
    messages: List[ChatMessage],
    response_selector: Optional[Callable[[List[str], int], str]] = None,
) -> Optional[str]:
    """
    Determines if the latest user message can be answered immediately by the local engine.
    Returns the instant response text if matched, or None if the request should be forwarded to Gemini.

    Guarantees:
    - Never intercepts complex or compound tasks (e.g. 'hi, write code' goes to Gemini).
    - Preserves context for conversational follow-ups ('tell me more') when the previous turn was local.
    - Selects natural, varied greeting responses deterministically.
    - Deterministic, extensible, and near-zero latency.
    """
    if not messages:
        return None

    last_user_message: Optional[ChatMessage] = None
    for msg in reversed(messages):
        if msg.role == "user":
            last_user_message = msg
            break

    if not last_user_message:
        return None

    raw_text = last_user_message.content.strip()
    normalized = normalize_text(raw_text)

    if not normalized:
        return None

    # 1. Greetings (natural recognition with repeated characters, emojis, and varied responses)
    detected_greeting = detect_pure_greeting(raw_text)
    if detected_greeting is not None:
        return select_greeting_response(detected_greeting, messages, response_selector)

    # 2. Identity & Introductions
    if normalized in IDENTITY_PATTERNS:
        return (
            "I'm OctoberAI, your minimalist desktop AI companion. "
            "I'm here to assist you with quick answers, writing, analysis, "
            "and problem-solving right from your desktop."
        )

    # 3. Capabilities
    if normalized in CAPABILITY_PATTERNS:
        return (
            "I can help answer questions, explain concepts, review and draft code or text, "
            "brainstorm ideas, and assist with everyday tasks. "
            "Feel free to ask me anything you're working on!"
        )

    # 4. Acknowledgements & Affirmations
    if normalized in THANKS_PATTERNS:
        return "You're welcome! Let me know if you need anything else."

    if normalized in AFFIRMATION_PATTERNS:
        return "Glad to help! Feel free to ask if there's anything else you'd like to explore."

    # 5. Farewells
    if is_pure_farewell(normalized):
        if any(np in normalized for np in NIGHT_PATTERNS):
            return "Good night! Rest well, and feel free to reach out whenever you're back."
        return "Goodbye! Have a great day ahead. I'll be right here whenever you need me."

    # 6. Basic Help & App Navigation
    if normalized in HELP_PATTERNS:
        return (
            "OctoberAI lives right on your desktop edge as a compact pill. "
            "Hover or click to expand, click the pin icon to keep the window open while multitasking, "
            "or press Escape to collapse it back. Type your message and press Enter to chat!"
        )

    # 7. Conversational Follow-up ('tell me more')
    if normalized in FOLLOWUP_PATTERNS:
        # Check prior assistant context
        last_assistant_msg: Optional[str] = None
        for msg in reversed(messages[:-1]):
            if msg.role == "assistant":
                last_assistant_msg = msg.content
                break

        if last_assistant_msg:
            # Check if previous assistant message was about Identity or Capabilities
            if "minimalist desktop AI companion" in last_assistant_msg or "help answer questions" in last_assistant_msg:
                return (
                    "OctoberAI is designed to stay unobtrusive while staying readily accessible on Windows. "
                    "It combines instant local responses for everyday conversational moments with Google Gemini's "
                    "advanced models for complex reasoning, code generation, and detailed analysis. "
                    "You can also pin it to your desktop for continuous workflows."
                )
            # Check if previous assistant message was about Help / App navigation
            if "desktop edge as a compact pill" in last_assistant_msg or "pin icon" in last_assistant_msg:
                return (
                    "A few helpful tips: you can press Escape anytime to quickly collapse the panel, "
                    "drag the window from the header, and keep it pinned while multitasking so it doesn't "
                    "close when you click away."
                )

        # If previous context was not local or not found, let Gemini handle the follow-up with full context!
        return None

    # No confident local match: defer to Gemini
    return None
