# ClipGenius Product Vision

## Product thesis

ClipGenius is an AI Content Production Engine that transforms raw video into polished, platform-optimized content campaigns.

Its promise is simple: **One Video. An Entire Content Campaign.**

The product is designed for people who already have valuable recorded content and need to turn it into consistent, effective distribution—not for people trying to generate an AI movie from nothing.

## Source-media promise

The creator's original recording remains the primary visual and editorial source. ClipGenius edits that recording: it may remove pauses and repetition, select excerpts, reframe shots, add captions and effects, and composite approved supporting assets. It does not turn a transcript into a replacement AI-generated performance.

Short-form clips are extracted from the creator's footage. AI-generated visuals, audio, or video may be offered later as optional supporting material, but they must never silently replace the original content. The product should always be able to identify whether an asset is original source media, uploaded by the user, AI-generated, or licensed from an external provider.

## Target users

- creators and podcasters repurposing long-form recordings;
- churches converting sermons into short-form teaching and inspiration;
- coaches and educators extracting lessons, stories, and calls to action;
- businesses converting webinars, interviews, and presentations into social content; and
- agencies managing repeatable content production for multiple clients.

## Core workflow

```text
Upload raw video
-> describe the desired result
-> understand the content
-> identify valuable opportunities
-> create a structured Edit Plan
-> render a polished master
-> generate platform-specific clips and copy
```

The user directs the outcome in natural language. ClipGenius translates that intent into validated editing operations and deterministic processing, shielding the user from codecs, command-line tools, model selection, and prompt engineering.

The interaction model supports two complementary workflows: a creator can ask ClipGenius to make professional editing decisions, or provide precise instructions such as placing an uploaded visual at a timestamp or when a phrase, topic, speaker, or event occurs. These instructions produce non-destructive revisions, so the original media remains intact and later edits can be changed or reversed.

A future reference-style workflow may let a creator upload an authorized reference, provide a supported platform URL, or describe a style in words. ClipGenius should extract general characteristics such as pacing, caption treatment, framing, transitions, and visual rhythm into a structured style profile, then apply that direction to the creator's own footage. It must not copy the reference's footage, audio, voice, branded elements, or exact sequence.

URL support is permission-aware rather than a generic social-media downloader. If an official integration cannot provide media that ClipGenius is permitted to analyze, the product should request an authorized upload or accept a written style description instead.

## V1 scope

V1 will focus on uploading and transcribing a video, content understanding, opportunity discovery, natural-language editing direction, structured Edit Plans, a real edited render, short-form clips, and optimization for YouTube, Instagram, TikTok, and Facebook. It will also generate hooks, titles, descriptions, and captions.

The milestones are intentionally incremental. Task 001 establishes only the engineering foundation.

## Differentiators

- **Content intelligence before clipping:** understand topics, arguments, stories, hooks, emotion, and standalone value instead of selecting arbitrary time ranges.
- **Intent-driven editing:** translate a creative instruction into an inspectable, schema-validated plan.
- **Campaign-level output:** treat editing as an engine within a broader content operation.
- **Platform-aware repurposing:** shape each output for its destination rather than exporting one generic clip everywhere.
- **Model-agnostic orchestration:** own product intelligence and provider selection instead of making one model the product.
- **Separation of intent and rendering:** AI decides what should happen; constrained video systems decide how.
- **Creator footage stays central:** original media is preserved while AI directs edits and repurposing.
- **Flexible creative control:** users can delegate decisions or direct individual edits in natural language.
- **Traceable supporting media:** user uploads, generated assets, and licensed media retain explicit provenance.
- **Reference-informed, not copied:** learn general editing characteristics from authorized references while producing an original edit from the creator's media.

## Roadmap

The first eleven milestones cover the engineering foundation, domain model, authentication and organizations, projects, upload, processing workers, transcription, content intelligence, the ClipGenius Editing Language, Edit Plans, and the first real AI-directed render.

Later work may add deeper editing, Brand DNA, campaigns, billing, publishing, analytics, and learning from performance. These capabilities are directional, not authorization to implement them early.
