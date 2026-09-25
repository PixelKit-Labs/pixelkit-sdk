# Sitemap and page coverage

81 specified destinations/states; 10 saved boards with 60 illustrative frames. Pages without their own frame use the linked family pattern and detailed written spec; they do not have a dedicated high-fidelity mockup yet. Image labels are local; this index uses stable spec IDs.

~~~mermaid
flowchart TD
  Chat[Active conversation] --> Hub[Full-screen conversation hub]
  Hub --> Channels[Channels and sessions]
  Channels --> Chat
  Hub --> Agent
  Hub --> Connections
  Hub --> Activity
  Hub --> Settings
  Hub --> Help[Help and reference]
  Chat --> Composer[Keyboard-safe composer]
~~~

## conversations

| ID | Page/state | Spec | Board coverage |
| --- | --- | --- | --- |
| C01 | Conversation hub | [spec](specs/conversations.md) | [01, frame 2](boards/board-01.png) |
| C02 | Active conversation | [spec](specs/conversations.md) | [01, frame 1](boards/board-01.png); [01, frame 4](boards/board-01.png) |
| C03 | Composer and draft | [spec](specs/conversations.md) | [02, frame 2](boards/board-02.png) |
| C04 | Voice listening / speech partial | [spec](specs/conversations.md) | [02, frame 1](boards/board-02.png) |
| C05 | Generating / thinking / speaking | [spec](specs/conversations.md) | Written spec + family 01/02 pattern |
| C06 | Confirmation barrier | [spec](specs/conversations.md) | [02, frame 6](boards/board-02.png) |
| C07 | Media attachment unavailable state | [spec](specs/conversations.md) | [02, frame 3](boards/board-02.png) |
| C08 | Image gallery | [spec](specs/conversations.md) | [02, frame 5](boards/board-02.png) |
| C09 | Camera capture | [spec](specs/conversations.md) | [02, frame 4](boards/board-02.png) |
| C10 | Session hub sheet (legacy) | [spec](specs/conversations.md) | Written spec + family 01/02 pattern |
| C11 | Session detail | [spec](specs/conversations.md) | Written spec + family 01/02 pattern |
| C12 | Conversation search | [spec](specs/conversations.md) | [01, frame 5](boards/board-01.png) |
| C13 | Topic channel hub | [spec](specs/conversations.md) | Written spec + family 01/02 pattern |
| C14 | Channel detail with sessions | [spec](specs/conversations.md) | [01, frame 3](boards/board-01.png) |
| C15 | Session/channel management | [spec](specs/conversations.md) | [01, frame 6](boards/board-01.png) |
| C16 | Recovery / unavailable conversation | [spec](specs/conversations.md) | [08, frame 6](boards/board-08.png) |

## agent

| ID | Page/state | Spec | Board coverage |
| --- | --- | --- | --- |
| A01 | Agent hub | [spec](specs/agent.md) | [03, frame 1](boards/board-03.png) |
| A02 | Identity and hardware target | [spec](specs/agent.md) | [03, frame 2](boards/board-03.png) |
| A03 | Specialist agent roster | [spec](specs/agent.md) | [03, frame 3](boards/board-03.png) |
| A04 | Memory overview and budget | [spec](specs/agent.md) | [03, frame 4](boards/board-03.png) |
| A05 | Memory semantic search/results | [spec](specs/agent.md) | Written spec + family 03/04 pattern |
| A06 | Memory editor/detail | [spec](specs/agent.md) | [03, frame 5](boards/board-03.png) |
| A07 | Procedural skills catalogue | [spec](specs/agent.md) | [03, frame 6](boards/board-03.png) |
| A08 | Skill editor | [spec](specs/agent.md) | [04, frame 1](boards/board-04.png) |
| A09 | Wiki and skill proposals | [spec](specs/agent.md) | [04, frame 2](boards/board-04.png); [04, frame 3](boards/board-04.png) |
| A10 | MCP feeds and connections | [spec](specs/agent.md) | Written spec + family 03/04 pattern |
| A11 | Registered tools | [spec](specs/agent.md) | [04, frame 4](boards/board-04.png) |
| A12 | Saved prompt library | [spec](specs/agent.md) | [04, frame 6](boards/board-04.png) |
| A13 | Prompt editor | [spec](specs/agent.md) | Written spec + family 03/04 pattern |
| A14 | Voice/persona behavior review | [spec](specs/agent.md) | Written spec + family 03/04 pattern |
| A15 | Agent/session routing | [spec](specs/agent.md) | Written spec + family 03/04 pattern |

## connections

| ID | Page/state | Spec | Board coverage |
| --- | --- | --- | --- |
| N01 | Connections home | [spec](specs/connections.md) | [05, frame 1](boards/board-05.png) |
| N02 | Local server configuration | [spec](specs/connections.md) | [05, frame 2](boards/board-05.png) |
| N03 | Client setup instructions | [spec](specs/connections.md) | [05, frame 3](boards/board-05.png) |
| N04 | Request inspector | [spec](specs/connections.md) | [05, frame 4](boards/board-05.png) |
| N05 | External service list | [spec](specs/connections.md) | [05, frame 5](boards/board-05.png) |
| N06 | External service editor | [spec](specs/connections.md) | [05, frame 6](boards/board-05.png) |
| N07 | Configuration import | [spec](specs/connections.md) | [06, frame 1](boards/board-06.png) |
| N08 | External service detail | [spec](specs/connections.md) | [06, frame 2](boards/board-06.png) |
| N09 | Event feeds | [spec](specs/connections.md) | [06, frame 3](boards/board-06.png) |
| N10 | Superseded Connections cloud concept | [spec](specs/connections.md) | [06, frame 4](boards/board-06.png) |
| N11 | Relay configuration | [spec](specs/connections.md) | [06, frame 5](boards/board-06.png) |
| N12 | WhatsApp integration | [spec](specs/connections.md) | [06, frame 6](boards/board-06.png) |
| N13 | Hosted tool catalogue | [spec](specs/connections.md) | [04, frame 5](boards/board-04.png) |

## activity

| ID | Page/state | Spec | Board coverage |
| --- | --- | --- | --- |
| T00 | Activity & Telemetry Hub Shell | [spec](specs/activity.md) | Written spec + family 07/08 pattern |
| T01 | Silicon Telemetry & Real-Time Hardware Overview | [spec](specs/activity.md) | [07, frame 1](boards/board-07.png) |
| T02 | Tool Execution Traffic & Latency Analytics | [spec](specs/activity.md) | [07, frame 2](boards/board-07.png) |
| T03 | Pipeline Trace Waterfall (Gantt-Chart Execution Spans) | [spec](specs/activity.md) | [07, frame 3](boards/board-07.png) |
| T03.1 | Span Detail Inspector Drawer | [spec](specs/activity.md) | [07, frame 4](boards/board-07.png) |
| T04 | Live Diagnostic Log Buffer & Event Stream | [spec](specs/activity.md) | [07, frame 5](boards/board-07.png) |
| T05 | System & Native Error Occurrences | [spec](specs/activity.md) | [07, frame 6](boards/board-07.png) |
| T06 | Standing Event Streams & SSE Feeds (Alias Route) | [spec](specs/activity.md) | Written spec + family 07/08 pattern |
| T07 | Generated Visual Artifacts & Archive | [spec](specs/activity.md) | Written spec + family 07/08 pattern |
| T07.1 | Image Detail & Prompt Crosslink Modal | [spec](specs/activity.md) | Written spec + family 07/08 pattern |
| T08 | Acoustic Hardware & Harmonic Benchmark | [spec](specs/activity.md) | [08, frame 1](boards/board-08.png) |

## settings

| ID | Page/state | Spec | Board coverage |
| --- | --- | --- | --- |
| S00 | Settings index and search | [spec](specs/settings.md) | [09, frame 1](boards/board-09.png) |
| S01 | Assistant identity | [spec](specs/settings.md) | [09, frame 2](boards/board-09.png) |
| S01.1 | Models | [spec](specs/settings.md) | [09, frame 3](boards/board-09.png) |
| S02 | API Keys & Security Credentials | [spec](specs/settings.md) | [09, frame 4](boards/board-09.png) |
| S03 | Model Context Protocol (MCP) Feeds (Alias Route) | [spec](specs/settings.md) | Written spec + family 09/10 pattern |
| S04 | Voice Activity Detection (VAD) & Wake Word | [spec](specs/settings.md) | [09, frame 5](boards/board-09.png) |
| S04.1 | Unavailable Wake Enrollment State | [spec](specs/settings.md) | [09, frame 6](boards/board-09.png) |
| S05 | Audio Subsystem, Earcons & 3-Mic Beam | [spec](specs/settings.md) | [10, frame 1](boards/board-10.png) |
| S06 | Cost Control, Token Ledger & Currency | [spec](specs/settings.md) | [10, frame 2](boards/board-10.png) |
| S07 | Safety Gate, SSRF Shield & Gating | [spec](specs/settings.md) | [10, frame 3](boards/board-10.png) |
| S08 | External Relay & WhatsApp Bridge | [spec](specs/settings.md) | Written spec + family 09/10 pattern |
| S09 | TypeSafe AI / Jev Service | [spec](specs/settings.md) | Written spec + family 09/10 pattern |
| S10 | About, Hardware Diagnostics & Reset | [spec](specs/settings.md) | [10, frame 4](boards/board-10.png); [10, frame 5](boards/board-10.png) |
| S10.1 | Doctor Failure & Settings Reset Failure States | [spec](specs/settings.md) | Written spec + family 09/10 pattern |
| S10.2 | Floating Unsaved Configuration Bar | [spec](specs/settings.md) | [10, frame 6](boards/board-10.png) |
| S11 | Confirmation Barrier Dialog Overlay | [spec](specs/settings.md) | Written spec + family 09/10 pattern |
| S10.3 | Developer overlay | [spec](specs/settings.md) | Written spec + family 09/10 pattern |

## guide

| ID | Page/state | Spec | Board coverage |
| --- | --- | --- | --- |
| G00 | Operational Guide & Knowledge Hub Shell | [spec](specs/guide.md) | [08, frame 2](boards/board-08.png) |
| G01 | Running It: Voice Operations & Edge Execution | [spec](specs/guide.md) | Written spec + family 08 pattern |
| G02 | Reference: Hardware Subsystems & Security | [spec](specs/guide.md) | [08, frame 3](boards/board-08.png) |
| G03 | Living Component Gallery | [spec](specs/guide.md) | [08, frame 4](boards/board-08.png) |
| G03.1 | Gallery Component Detail & Token Drawer | [spec](specs/guide.md) | Written spec + family 08 pattern |
| G04 | On-Device API Reference & SDK Hook Viewer (Proposed Reuse) | [spec](specs/guide.md) | Written spec + family 08 pattern |
| G04.1 | Search Empty State & Deep-Link Error | [spec](specs/guide.md) | Written spec + family 08 pattern |
| G05 | Golden Rules & Architectural Directives (Proposed Reuse) | [spec](specs/guide.md) | Written spec + family 08 pattern |
| G06 | Interface Recovery & Error Boundary Screen | [spec](specs/guide.md) | [08, frame 5](boards/board-08.png) |

See [legacy disposition](LEGACY.md), [foundation](FOUNDATION.md), and [board corrections](REVIEW_NOTES.md).
