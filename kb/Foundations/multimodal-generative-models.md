---
title: Multimodal and Generative Models
category: Foundations
url: https://huggingface.co/docs/diffusers/index
license: Apache-2.0
as_of_date: 2026-06-22
sources:
  - {url: https://huggingface.co/docs/diffusers/index, license: Apache-2.0, kind: official_docs}
  - {url: https://huggingface.co/docs/diffusers/using-diffusers/write_own_pipeline, license: Apache-2.0, kind: official_docs}
  - {url: https://github.com/huggingface/diffusers, license: Apache-2.0, kind: oss_repo}
  - {url: https://github.com/openai/whisper, license: MIT, kind: oss_repo}
  - {url: https://d2l.ai/chapter_generative-adversarial-networks/gan.html, license: CC-BY-SA-4.0, kind: educational_textbook}
  - {url: https://arxiv.org/abs/1312.6114, license: "arXiv.org perpetual non-exclusive license; facts only", kind: paper}
  - {url: https://arxiv.org/abs/1406.2661, license: "arXiv.org perpetual non-exclusive license; facts only", kind: paper}
---

## What it is

Multimodal generative models process or produce more than one kind of signal: text, images, audio, video, layout, or structured data. Diffusion models generate media through repeated denoising. VAEs learn a compressed latent space that can be decoded back into data. GANs train a generator against a discriminator. ASR models such as Whisper convert speech audio into text tokens.

Together, these model families explain how modern AI systems can write, listen, transcribe, see, edit images, synthesize media, and connect language to visual or audio inputs.

## Why it exists / when to reach for it

Language alone is not enough for many agentic products. A teaching app may need to read screenshots, explain diagrams, transcribe a learner's spoken question, generate visual examples, or reason over mixed text and images. Multimodal models exist to bridge those representations instead of forcing every input through plain text first.

Reach for this topic when deciding whether a feature needs generation, recognition, retrieval over media, transcription, or a pipeline that combines several of them.

## The moving parts

- Encoders: turn media into vectors or latent representations.
- Decoders: turn vectors or latents back into text, pixels, audio, or other outputs.
- Diffusion denoiser: predicts how to move a noisy sample toward a clean one.
- Scheduler: controls the denoising timesteps and speed-quality tradeoff.
- VAE latent space: compresses media to a smaller representation for efficient generation or reconstruction.
- GAN generator and discriminator: competing networks used to improve sample realism.
- ASR frontend: converts audio into features such as log-Mel spectrograms.
- Conditioning: text prompts, image references, masks, speaker language, or layout constraints that guide generation.

## How it works

A diffusion image pipeline usually begins with random noise. At each timestep, a denoising model predicts a correction, and the scheduler uses that prediction to step toward a cleaner sample. Latent diffusion performs this loop in a compressed image space, then decodes the final latent into pixels. Text-to-image systems add a text encoder so the denoising process is conditioned on the prompt.

A VAE learns an encoder that maps inputs to a distribution in latent space and a decoder that reconstructs from sampled latents. A GAN trains two networks together: the generator tries to produce convincing samples while the discriminator tries to distinguish generated samples from real data.

Whisper-style ASR takes audio features, encodes them, and decodes text tokens for transcription or translation. In an agent pipeline, the transcript may then feed a language model, retriever, evaluator, or tool call.

## When to use vs alternatives

Use diffusion models for high-quality image, video, or audio generation and editing. Use VAEs for compression, latent manipulation, or as components inside larger systems. Use GANs when adversarial training fits the data and latency constraints, though diffusion is now more common for many image-generation workflows. Use ASR when the source of truth is spoken audio. Use classical OCR, image processing, speech recognition, or templates when the task is constrained, deterministic, and cheaper without a large generative model.

## Failure modes & gotchas

- Generated media can contain artifacts, unsafe content, biased depictions, or misleading details.
- Prompts may be ignored, overfit, or interpreted differently across models.
- Diffusion quality, step count, scheduler choice, and latency are tightly linked.
- Model code licenses, model weight licenses, and output usage rights can differ.
- ASR can fail on accents, noise, overlapping speakers, domain terms, or low-quality audio.
- Multimodal inputs can carry prompt injection in images, documents, captions, and transcripts.
- Evaluation is harder because "looks good" and "is correct" are different standards.

## Minimal code shape

```pseudo
conditioning = text_encoder(prompt)
latent = random_noise(shape)

for timestep in scheduler.timesteps:
  noise_prediction = denoiser(latent, timestep, conditioning)
  latent = scheduler.step(latent, noise_prediction, timestep)

image = vae_decoder(latent)
moderate_and_return(image)
```

## Key links

- https://huggingface.co/docs/diffusers/index
- https://huggingface.co/docs/diffusers/using-diffusers/write_own_pipeline
- https://github.com/huggingface/diffusers
- https://github.com/openai/whisper
- https://d2l.ai/chapter_generative-adversarial-networks/gan.html
- https://arxiv.org/abs/1312.6114
- https://arxiv.org/abs/1406.2661
