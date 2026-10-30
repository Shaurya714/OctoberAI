import pytest
from app.schemas import ChatMessage
from app.services.local_response import (
    get_local_response,
    normalize_text,
    detect_pure_greeting,
    GREETING_RESPONSES_GENERAL,
)


def test_normalize_text():
    assert normalize_text("  Hello, World!  ") == "hello world"
    assert normalize_text("What can you do???") == "what can you do"
    assert normalize_text("GOOD MORNING...") == "good morning"
    assert normalize_text("what's up :D") == "whats up"


@pytest.mark.parametrize(
    "greeting_input,expected_type",
    [
        # Exact and repeated-letter greetings
        ("hi", "hi"),
        ("hii", "hi"),
        ("hiii", "hi"),
        ("hiiii", "hi"),
        ("Hiiii", "hi"),
        ("HIIII!", "hi"),
        ("hey", "hey"),
        ("heyy", "hey"),
        ("heyyy", "hey"),
        ("HEYYYY!", "hey"),
        ("hello", "hello"),
        ("helloo", "hello"),
        ("hellooo", "hello"),
        ("Hellooo OctoberAI", "hello"),
        ("heya", "heya"),
        ("heyo", "heya"),
        ("heyo!", "heya"),
        ("hiya", "hiya"),
        ("howdy", "howdy"),
        ("yo", "yo"),
        ("yooo", "yo"),
        ("sup", "sup"),
        ("suup", "sup"),
        ("suuup", "sup"),
        ("good morning", "morning"),
        ("Good morning OctoberAI", "morning"),
        ("good evening", "evening"),
        ("good afternoon", "afternoon"),
        ("what's up", "sup"),
        ("whats up", "sup"),
        ("what's up :D", "sup"),
        ("Hello OctoberAI :)", "hello"),
        ("Hiiii 😊", "hi"),
        ("Hey there! 👋", "hey"),
        ("sup buddy", "sup"),
        ("hi, how are you?", "hi"),
    ],
)
def test_greeting_recognition_and_variations(greeting_input, expected_type):
    """Verifies that common greeting variations, repeated letters, emojis, and punctuation are recognized."""
    detected = detect_pure_greeting(greeting_input)
    assert detected == expected_type, f"Failed for '{greeting_input}': expected {expected_type}, got {detected}"

    messages = [ChatMessage(role="user", content=greeting_input)]
    response = get_local_response(messages)
    assert response is not None
    assert len(response) > 0


@pytest.mark.parametrize(
    "false_positive",
    [
        "high",
        "High",
        "history",
        "History of art",
        "highlight",
        "Highlight this syntax",
        "highway",
        "hip",
        "hike",
        "hide",
        "hill",
        "hit",
        "super",
        "supper",
        "supply",
        "support",
        "supersonic",
    ],
)
def test_false_positive_rejection(false_positive):
    """Verifies that words starting with greeting prefixes (high, history, highlight, super) are NOT classified as greetings."""
    assert detect_pure_greeting(false_positive) is None
    messages = [ChatMessage(role="user", content=false_positive)]
    response = get_local_response(messages)
    assert response is None, f"False positive matched for: '{false_positive}'"


@pytest.mark.parametrize(
    "complex_or_mixed_prompt",
    [
        "Hi, can you explain neural networks?",
        "Hey, write a Python program to sort a list.",
        "Hello, what is the capital of France?",
        "What's up with quantum computing?",
        "Hi! 2 + 2 = ?",
        "Hiiii, write a unit test for my React component",
        "HEYYYY! Can you debug this error?",
        "Hello OctoberAI, how does quicksort work?",
        "Sup buddy, what is the weather in Tokyo?",
        "Good morning, summarize this article for me",
        "Who are you inspired by?",
        "What can you do to optimize PostgreSQL queries?",
        "How can you help me prepare for a technical interview?",
        "Thanks, now please calculate the square root of 144",
        "Great, but what is the capital of Australia?",
        "Write a poem about autumn in October",
        "Explain the difference between TCP and UDP",
    ],
)
def test_complex_and_mixed_queries_route_to_gemini(complex_or_mixed_prompt):
    """Verifies that queries with tasks, questions, or mixed greetings are NOT hijacked locally."""
    messages = [ChatMessage(role="user", content=complex_or_mixed_prompt)]
    response = get_local_response(messages)
    assert response is None, f"Expected None for '{complex_or_mixed_prompt}', got '{response}'"


def test_conversational_variation_across_greetings():
    """Verifies that different greetings return varied, natural responses."""
    resp_hi = get_local_response([ChatMessage(role="user", content="hi")])
    resp_hey = get_local_response([ChatMessage(role="user", content="hey")])
    resp_hello = get_local_response([ChatMessage(role="user", content="hello")])
    resp_sup = get_local_response([ChatMessage(role="user", content="what's up")])

    # All should be valid responses
    assert resp_hi in GREETING_RESPONSES_GENERAL
    assert resp_hey in GREETING_RESPONSES_GENERAL
    assert resp_hello in GREETING_RESPONSES_GENERAL
    assert resp_sup in GREETING_RESPONSES_GENERAL

    # At least 3 distinct responses across these 4 distinct greeting roots
    responses_set = {resp_hi, resp_hey, resp_hello, resp_sup}
    assert len(responses_set) >= 3

    # All must be distinct from the initial welcome message
    assert "Hey! What's on your mind?" not in responses_set


def test_conversational_variation_across_turns():
    """Verifies that repeated greetings within the same conversation cycle deterministically."""
    # Turn 1: user says "hi"
    messages = [ChatMessage(role="user", content="hi")]
    r1 = get_local_response(messages)

    # Turn 2: user says "hi" again
    messages.extend([
        ChatMessage(role="assistant", content=r1),
        ChatMessage(role="user", content="hi"),
    ])
    r2 = get_local_response(messages)

    assert r1 != r2, f"Expected variation across turns, got '{r1}' and '{r2}'"


def test_greeting_response_selector_injection():
    """Verifies that an injected response selector can override selection for predictable testing."""
    custom_selector = lambda options, turn: "Custom injected greeting response"
    messages = [ChatMessage(role="user", content="Hiiii")]
    response = get_local_response(messages, response_selector=custom_selector)
    assert response == "Custom injected greeting response"


@pytest.mark.parametrize(
    "identity_input",
    [
        "who are you",
        "Who are you?",
        "what is octoberai",
        "What is OctoberAI?",
        "what is october ai",
        "what is your name",
        "What is your name?",
        "what are you",
        "tell me about yourself",
        "introduce yourself",
        "who made you",
    ],
)
def test_identity_queries(identity_input):
    messages = [ChatMessage(role="user", content=identity_input)]
    response = get_local_response(messages)
    assert response is not None
    assert "OctoberAI" in response
    assert "minimalist desktop AI companion" in response


@pytest.mark.parametrize(
    "capability_input",
    [
        "what can you do",
        "What can you do?",
        "how can you help me",
        "How can you help me?",
        "what are your features",
        "what are your capabilities",
        "what do you do",
        "what can i ask you",
    ],
)
def test_capability_queries(capability_input):
    messages = [ChatMessage(role="user", content=capability_input)]
    response = get_local_response(messages)
    assert response is not None
    assert "answer questions" in response or "assist" in response


@pytest.mark.parametrize(
    "ack_input,expected_phrase",
    [
        ("thanks", "welcome"),
        ("Thank you!", "welcome"),
        ("thank you so much", "welcome"),
        ("thanks a lot", "welcome"),
        ("thx", "welcome"),
        ("ok", "Glad to help"),
        ("okay", "Glad to help"),
        ("cool", "Glad to help"),
        ("great", "Glad to help"),
        ("awesome", "Glad to help"),
        ("nice", "Glad to help"),
        ("got it", "Glad to help"),
        ("understood", "Glad to help"),
        ("perfect", "Glad to help"),
        ("sounds good", "Glad to help"),
    ],
)
def test_acknowledgements(ack_input, expected_phrase):
    messages = [ChatMessage(role="user", content=ack_input)]
    response = get_local_response(messages)
    assert response is not None
    assert expected_phrase.lower() in response.lower()


@pytest.mark.parametrize(
    "farewell_input,expected_phrase",
    [
        ("bye", "Goodbye"),
        ("Goodbye!", "Goodbye"),
        ("see you", "Goodbye"),
        ("see you later", "Goodbye"),
        ("cya", "Goodbye"),
        ("good night", "Good night"),
        ("goodnight!", "Good night"),
        ("sleep well", "Good night"),
    ],
)
def test_farewells(farewell_input, expected_phrase):
    messages = [ChatMessage(role="user", content=farewell_input)]
    response = get_local_response(messages)
    assert response is not None
    assert expected_phrase.lower() in response.lower()


@pytest.mark.parametrize(
    "help_input",
    [
        "help",
        "Help!",
        "how do i use this",
        "how does this app work",
        "how to use octoberai",
        "how do i pin this",
        "how to collapse",
        "how to close",
        "keyboard shortcuts",
    ],
)
def test_help_and_navigation(help_input):
    messages = [ChatMessage(role="user", content=help_input)]
    response = get_local_response(messages)
    assert response is not None
    assert "pill" in response.lower() or "pin" in response.lower() or "escape" in response.lower()


def test_followup_after_identity_or_capability():
    messages = [
        ChatMessage(role="user", content="who are you"),
        ChatMessage(
            role="assistant",
            content="I'm OctoberAI, your minimalist desktop AI companion. I'm here to assist you with quick answers.",
        ),
        ChatMessage(role="user", content="tell me more"),
    ]
    response = get_local_response(messages)
    assert response is not None
    assert "unobtrusive" in response.lower() or "gemini" in response.lower()


def test_followup_after_help():
    messages = [
        ChatMessage(role="user", content="help"),
        ChatMessage(
            role="assistant",
            content="OctoberAI lives right on your desktop edge as a compact pill. Use the pin icon to keep open.",
        ),
        ChatMessage(role="user", content="can you elaborate"),
    ]
    response = get_local_response(messages)
    assert response is not None
    assert "tips" in response.lower() or "escape" in response.lower()


def test_followup_without_local_context_returns_none():
    """A follow-up to an arbitrary or complex question must NOT be intercepted locally."""
    messages = [
        ChatMessage(role="user", content="Explain quantum entanglement"),
        ChatMessage(
            role="assistant",
            content="Quantum entanglement is a physical phenomenon where pairs or groups of particles interact...",
        ),
        ChatMessage(role="user", content="tell me more"),
    ]
    response = get_local_response(messages)
    assert response is None
