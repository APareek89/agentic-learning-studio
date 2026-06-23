---
title: "Voice Agents"
category: "Agent frameworks"
url: "https://docs.livekit.io/agents/"
license: "Apache-2.0"
verdict: "Best when realtime latency, turn-taking, interruption, and audio operations are first-class product needs."
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.livekit.io/agents/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/livekit/agents", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://github.com/openai/whisper", license: "MIT", kind: "oss_repo"}
---

## What it is

Voice agents are realtime AI systems that listen, reason, use tools, and speak back. They combine audio transport, speech recognition, turn detection, an LLM or realtime model, tool calls, text-to-speech, and conversation state.

LiveKit Agents is a framework for server-side realtime agents. Whisper is a speech-recognition model and toolkit that is useful background for understanding ASR, multilingual transcription, translation, and the limits of batch transcription.

## Why it exists / when to reach for it

Voice changes the product contract. Users expect fast turn-taking, natural interruption, low audio latency, and graceful recovery from misheard words. A chat agent can pause and show a correction; a voice agent has to manage silence, overlap, background noise, and spoken confirmations.

Reach for voice when hands-free interaction, phone calls, accessibility, field work, tutoring, or realtime support matters.

## The moving parts

- Realtime transport: WebRTC, SIP, or another low-latency audio channel.
- Voice activity and turn detection: decides when the user is speaking or finished.
- STT or realtime input model: converts audio to text or model tokens.
- Dialogue agent: instructions, state, memory, and tool policy.
- Tools: function calls, MCP tools, account actions, search, or workflow triggers.
- TTS or realtime output model: streams speech back to the user.
- Session runtime: job dispatch, room connection, participant lifecycle, and cleanup.
- Evaluation and monitoring: transcripts, latency, interruptions, tool outcomes, and audio quality.

## How it works

Audio streams into a session. The runtime detects speech, sends audio or transcripts to the model layer, updates conversation state, and decides whether to speak, ask a clarification, or call a tool. Speech output is streamed as soon as possible, while barge-in handling lets the user interrupt and redirect the response.

In a pipeline design, STT, LLM, and TTS are separate components. In a realtime-model design, one model may handle more of the audio-to-audio loop directly. The pipeline is easier to swap and audit; the realtime model can reduce latency and preserve paralinguistic cues.

## When to use vs alternatives

Use text chat when auditability, precision, and low implementation complexity matter most. Use push-to-talk when interruption handling is not required. Use LiveKit-style realtime infrastructure when the product needs rooms, telephony, dispatch, multimodal participants, or production session management.

Whisper-style batch ASR is excellent for offline transcription and many speech tasks, but it is not by itself a complete low-latency voice agent runtime.

## Failure modes & gotchas

Latency compounds across VAD, STT, LLM, tools, and TTS. Misrecognition can trigger the wrong tool, so high-impact actions need spoken confirmation. Barge-in can cut off important safety language if not handled deliberately. Audio logs and transcripts may contain sensitive personal data, so consent, retention, and redaction must be designed before launch.

Test in noisy rooms, on phone audio, with accents, with overlapping speech, and with long silences. Measure time to first audio, time to final answer, interruption success, and tool-call accuracy.

## Minimal code shape (pseudocode/short snippet you write)

```python
session = VoiceSession(
    transport=livekit_room,
    vad=turn_detector,
    stt=speech_to_text,
    llm=dialogue_model,
    tts=text_to_speech,
    tools=[lookup_order, create_ticket],
)

async for event in session.events():
    if event.type == "user_turn":
        reply = await agent.respond(event.transcript, session.state)
        if reply.tool_call and policy.needs_confirmation(reply.tool_call):
            await session.say(confirm_prompt(reply.tool_call))
        else:
            await session.stream(reply)
```

## Key links

- LiveKit Agents docs: https://docs.livekit.io/agents/
- LiveKit Agents repository: https://github.com/livekit/agents
- Whisper repository: https://github.com/openai/whisper
