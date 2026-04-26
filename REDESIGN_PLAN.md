# llama-router Web UI Redesign Plan

**Created:** 2026-04-25  
**Status:** Planning Phase  
**Author:** Hermes Agent

---

## Table of Contents

1. [Project Analysis](#project-analysis)
2. [Problem Statement](#problem-statement)
3. [Design Vision](#design-vision)
4. [New Architecture](#new-architecture)
5. [Key Features](#key-features)
6. [Implementation Plan](#implementation-plan)
7. [File Structure](#file-structure)
8. [Technical Decisions](#technical-decisions)

---

## Project Analysis

### Current State
- Backend: Flask (app.py, 73KB, 100+ parameters in 16 categories)
- Frontend: Single HTML file (index.html, 3,492 lines, vanilla JS)
- Tabs: Models, Profiles, Downloads, Metrics, Config, Add Model
- Features: Models CRUD, Profile Management, Download Manager, GPU Metrics

### Completed Features
1. Profiles Management System
2. Models Page Redesign
3. UI Styling Improvements

### Missing Features
1. Chat Interface - No way to test models
2. Model Comparison - Side-by-side comparison
3. Batch Operations - Load/unload multiple models
4. Model Deduplication - Same file appears twice
5. Lifecycle Management - No auto-unload/keep-alive

---

## Problem Statement

### Core Issues

1. No Chat UI - Cannot test models after loading
2. Profile System Complexity - 100+ parameters overwhelm users
3. Duplicate Models - Same model file appears with different names
4. Single-File Frontend - 3,492 lines difficult to maintain
5. No Lifecycle Management - Manual unload only, no auto-cleanup
6. Same Model, Multiple Profiles - Cannot load same model with different settings

### User Pain Points
- I loaded a model, now how do I chat with it?
- I want to compare Fast vs Creative profiles on the same model
- The profile form is overwhelming, I don not know what to change
- Why is VRAM full? I don not know which models are loaded
- I want to keep SmolLM2 always loaded, but auto-unload others

---

## Design Vision

### Philosophy
> Manage models TO USE them - not just to manage them

### Concept: Chat-First LLM Router

Primary Goal: Enable users to quickly load models and start chatting, with model management as a secondary concern.

---

## New Architecture

### New Tabs

1. Dashboard - Overview + quick actions
2. Chat - PRIMARY - chat interface with model switcher
3. Models - Model + instance management
4. Profiles - Simplified profile builder
5. Downloads - Download manager (existing)
6. Settings - Config + metrics + lifecycle

---

## Key Features

### 1. Named Instances

Problem: Cannot load same model with different profiles.

Solution: Use llama.cpp aliases to create named instances.

Example:
  [SmolLM2 1.7B]
  model = /models/smollm2-1.7b-instruct-q4_k_m.gguf
  ctx-size = 8192
  temp = 0.7

  [SmolLM2 1.7B (Fast)]
  model = /models/smollm2-1.7b-instruct-q4_k_m.gguf
  ctx-size = 4096
  temp = 0.3

  [SmolLM2 1.7B (Creative)]
  model = /models/smollm2-1.7b-instruct-q4_k_m.gguf
  ctx-size = 8192
  temp = 1.2

UI Integration:
- Load profile -> creates named instance
- Models tab groups instances by file
- Chat UI shows instance name
- Can remove instance without deleting file

### 2. Lifecycle Management

Features:
- Keep-Alive - Auto-unload after X seconds of inactivity
- Pin - Never unload pinned instances
- Preload - Load marked instances on startup
- Eviction Priority - LRU eviction when VRAM full
- Last-Used Tracking - Timestamp for each request

Config Extension:
  [SmolLM2 1.7B (Fast)]
  model = /models/smollm2-1.7b-instruct-q4_k_m.gguf
  ctx-size = 4096
  temp = 0.3
  # Lifecycle
  keep-alive = 300     # seconds (0 = never auto-unload)
  pinned = true        # never unload regardless
  priority = high      # high/medium/low
  last-used = 1745371234
  preload = true       # load on startup

Lifecycle Manager Component:
- Background thread checking every 60 seconds
- Auto-unload idle instances (respects keep-alive & pinned)
- LRU eviction when VRAM > 90%
- Update last-used on every chat request

### 3. Chat Interface

Features:
- Real-time streaming - OpenAI-compatible API with streaming
- Model switcher - Change model mid-chat
- Chat history - Save/load conversations
- Token counter - Track usage
- System prompt - Per-chat configuration
- Export - Markdown/JSON export

### 4. Simplified Profile System

Problem: 100+ parameters overwhelm users.

Solution:

Tabbed Interface:
1. Basic - Core 8 parameters (always visible)
2. Quality - Sampling quality controls
3. Advanced - Expert parameters (DRY, XTC, Mirostat)
4. Performance - GPU/CPU tuning
5. Server - Network settings
6. Special - Multimodal, Grammar

Quick Presets:
- Fast - Quick responses (temp=0.3, ctx=4096)
- Balanced - Default (temp=0.7, ctx=8192)
- Creative - Diverse (temp=1.2, ctx=8192)
- Reasoning - Extended thinking
- Precise - Deterministic (temp=0.1)

Advanced Mode Toggle: Show all 100+ parameters

### 5. Validation & Defaults

3-Level Protection:
1. Client-side - Real-time validation + visual feedback
2. Server-side - Schema-based validation + fallback defaults
3. llama.cpp - Final engine validation

Features:
- Required field indicators
- Pre-filled defaults
- Range validation (min/max)
- Type checking (int/float/str)
- Allowed values validation
- Reset to Defaults button
- Help tooltips for each parameter
- Validation summary on save

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
- Refactor frontend -> modular structure
- Create tab navigation system
- Design Dashboard layout
- Set up new file structure

### Phase 2: Backend Foundation (Week 1-2)
- Create lifecycle_manager.py
- Create validation.py module
- Add named instance support
- API endpoints for lifecycle

### Phase 3: Chat Interface (Week 2-3)
- Build chat UI components
- Implement streaming API calls
- Add model switcher
- Chat history management
- Token counter

### Phase 4: Models & Instances (Week 3)
- Redesign Models tab
- Instance grouping by file
- Lifecycle controls (pin, keep-alive)
- Model deduplication

### Phase 5: Profiles Refactor (Week 4)
- Simplified profile builder
- Tabbed parameter UI
- Quick presets
- Advanced mode toggle
- Validation integration

### Phase 6: Dashboard & Settings (Week 4-5)
- Dashboard redesign
- Settings page (lifecycle, config)
- Preload manager
- GPU monitoring

### Phase 7: Polish (Week 5-6)
- Responsive design
- Performance optimization
- Error handling
- Documentation
- Testing

---

## File Structure

### New Structure
llama-router/
  web/
    app.py                    # Main Flask app (simplified)
    lifecycle_manager.py      # NEW: Lifecycle management
    validation.py             # NEW: Parameter validation
    templates/
      index.html            # Main layout (small, ~500 lines)
      dashboard.html        # NEW: Dashboard page
      chat.html             # NEW: Chat interface
      models.html           # NEW: Models management
      profiles.html         # NEW: Profile builder
      downloads.html        # NEW: Download manager
      settings.html         # NEW: Settings page
    static/
      css/
        main.css
        dashboard.css
        chat.css
        ...
      js/
        main.js
        dashboard.js
        chat.js
        models.js
        profiles.js
        validation.js
        store.js
      images/
    data/
      profiles.ini
      chats/                # NEW: Chat history
        *.json
  config.ini
  docker-compose.yml
  Makefile
  README.md
  PROJECT_PROGRESS.md
  REDESIGN_PLAN.md          # This file

### Key Changes
- Split index.html -> 7 focused HTML files
- New Python modules -> lifecycle_manager, validation
- Modular CSS/JS -> One file per tab
- Chat history storage -> JSON files in web/data/chats/

---

## Technical Decisions

### Frontend Framework
- Decision: Vanilla JS (no React/Vue)
- Reason: Keep it simple, no build step, single container
- Approach: Component-based with module pattern

### State Management
- Decision: Simple store pattern (store.js)
- Implementation: Centralized state with pub/sub
- Reason: Manage shared state (models, profiles, chat)

### Chat Streaming
- Decision: Server-Sent Events (SSE) or WebSockets
- Reason: Real-time token streaming
- Implementation: Flask-SSE or native WebSocket

### Lifecycle Monitoring
- Decision: Background thread in Flask
- Implementation: lifecycle_manager.py with asyncio
- Interval: Check every 60 seconds

### Validation Strategy
- Decision: Schema-driven validation
- Implementation: Single source of truth (PARAM_SCHEMA dict)
- Applied: Both client and server use same schema

### Instance Naming
- Decision: Auto-generated names with manual override
- Convention: {model_name} ({profile_name})
- Uniqueness: Append suffix if conflict

---

## Parameters Schema

### Categories (16 total)

1. Basic - model, ctx-size, n-gpu-layers, temp, top-p, top-k, flash-attn, reasoning
2. Sampling Core - min-p, typical, seed
3. Repetition Control - repeat-last-n, repeat-penalty, presence-penalty, frequency-penalty
4. Advanced Sampling - dynatemp, mirostat, adaptive
5. DRY - dry-multiplier, dry-base, dry-allowed-length, dry-penalty-last-n, dry-sequence-breaker
6. XTC - xtc-probability, xtc-threshold
7. Adaptive - adaptive-target, adaptive-decay
8. RoPE Scaling - rope-scaling, rope-scale, rope-freq-base, rope-freq-scale
9. Memory & Cache - cache-ram, batch-size, ubatch-size, n-predict
10. GPU Settings - split-mode, tensor-split, main-gpu, cache-type-k/v, kv-offload
11. CPU Settings - threads, threads-batch, mlock, mmap
12. Reasoning Options - reasoning-budget, reasoning-format
13. Chat Template - chat-template, chat-template-file
14. Server Settings - host, port, np, timeout
15. Multimodal - mmproj, mmproj-offload
16. Output Constraints - grammar, grammar-file, json-schema

### Important vs Optional

Important (show by default):
- model, ctx-size, temp, top-p, top-k, flash-attn, n-gpu-layers

Advanced (hide by default):
- DRY, XTC, Adaptive, Mirostat, RoPE

Special (case-by-case):
- Multimodal (vision models only)
- Grammar (strict output format required)

---

## Success Criteria

- Users can load model and chat within 3 clicks
- Same model can be loaded with multiple profiles
- Auto-unload works without manual intervention
- Profile form is not overwhelming for new users
- Chat history is saved and accessible
- Code is modular and maintainable
- Documentation is complete

---

## Notes

- Preserve all existing API endpoints for backward compatibility
- Keep existing profiles.ini format
- Maintain Docker container structure
- Test with multiple GPU configurations
- Ensure mobile responsiveness

---

Last Updated: 2026-04-25 23:30  
Next Step: Begin Phase 1 - Frontend Refactoring
