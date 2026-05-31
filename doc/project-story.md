# Project Story: ChatTree

## Inspiration

The inspiration for ChatTree stemmed from a daily developer frustration with mainstream AI chat interfaces (like ChatGPT and Gemini). While these platforms have introduced basic message editing and branching (e.g., toggling between version $< 1/2 >$), their linear UI model remains fundamentally restrictive:
1. **Hidden Branches**: When you edit a prompt in ChatGPT or Gemini, the alternate path is hidden behind a dropdown selector. You cannot view both paths simultaneously, making side-by-side comparison of different prompts or models impossible.
2. **The Poisoned Context Dilemma**: In a single linear conversation flow, asking multiple parallel, independent questions causes the context to accumulate uncontrollably. The answer to your first query "poisons" the context for the second. The LLM gradually loses focus, gets confused by shifting references, and eventually strays from or completely ignores your initial reference documents.
3. **Scroll Fatigue**: Finding a specific past query, code block, or system instruction in a long linear thread requires endless scrolling through thousands of lines of dialogue.

We realized that complex human-AI reasoning is not a straight line—it is a branching tree of explorations. We wanted to build a tool that makes this tree visual, interactive, and cleanly isolated.

---

## What it does

ChatTree is a visual, canvas-based Chat UI built on top of a ReactFlow graph. It transforms traditional linear chat logs into a fully interactive conversation tree.

* **Explicit Visual Branching**: Instead of hiding branches behind dropdown menus, ChatTree maps every path as a visible, node-based tree. Users can branch off from any point in the conversation history instantly.
* **Strict Parent Context Inheritance**: Each node in the tree inherits *only* the context of its direct ancestors (its parent path). Parallel questions on different branches are mathematically isolated, meaning they can never "poison" or contaminate each other's context space. The model remains 100% focused on the reference document.
* **Multi-Branch Merging**: Users can select multiple leaf nodes and merge their context paths back together into a single node. ChatTree handles context reconstruction with smart compression options (`raw`, `milestones`, and `summary`) to avoid token bloat.
* **Zoom-to-Focus Navigation**: Replaces scroll fatigue. Double-clicking any node instantly pans and centers the canvas smoothly onto that part of the conversation timeline.
* **Visual Artifact Nodes**: Flat canvas card elements (text/images) that persist outside the main dialogue tree and can be dynamically injected into branch merges.
* **Stateless Sharing & Privacy**: Gzip-compressed Base64 URL state sharing and local storage caching mean zero backend database dependency and total key privacy.

---

## How we built it

ChatTree was designed as a static client-side single-page application (SPA):

* **Tech Stack**: Next.js 16 (App Router & Turbopack), React 19, and **ReactFlow 11** for graph engine computations.
* **Visual Polish**: Custom theme tokens on Material UI (MUI 7) supporting glassmorphic panels, glowing Milestones sidebars, and fluid typing eases.
* **Math & Markdown**: CDN-loaded KaTeX and autoloader Prism.js dynamically integrated via `markdown-to-jsx` overrides.
* **The "Vibe Coding" Development Cycle**: The project was built in a rapid人机结对 (human-AI) pair programming rhythm. The developer directed the architectural layout and flow logic, while the coding agent generated layout elements, optimized canvas node updates, and secured DOM outputs.

---

## Challenges we ran into

### 1. Context Summation on N-Branch Merging
When merging $n$ branches $B_1, B_2, \ldots, B_n$, the total tokens $T_{\text{merged}}$ are a linear sum of individual branch tokens:

$$T_{\text{merged}} = \sum_{i=1}^{n} T(B_i)$$

To prevent $T_{\text{merged}}$ from exceeding the LLM context limit $C$ ($\sum T(B_i) > C$), we designed the **Milestones** compression filter. Let $M(B_i)$ be the milestone set (retaining only the first question and final response). The footprint shrinks to:

$$T_{\text{merged}} = \sum_{i=1}^{n} T(M(B_i)) \ll C$$

This keeps the merged context clean and compliant with the context window boundaries.

### 2. Typing Stream Reconciliation Congestion
Streaming text updates via SSE to ReactFlow nodes triggered React reconciliation cycles across the entire tree, resulting in canvas layout jitters.
* *Solution*: We isolated the message input to a decoupled local state (`localMessage` in `InputPanel.js`), writing to the parent state only on `onBlur`. In addition, we introduced an easing buffer utilizing `requestAnimationFrame` to render streaming tokens smoothly and fluidly without frame drops.

### 3. SVG Script Injection Security
Rendering LLM-generated SVGs with `dangerouslySetInnerHTML` allows embedded scripts (e.g., `<svg onload="...">`) to run inside the parent origin, creating a vulnerability that could steal API Keys from `localStorage`.
* *Solution*: We replaced HTML embedding with a static image tag: `<Box component="img" src={"data:image/svg+xml," + encodeURIComponent(cleanCode)} />`. Browsers treat SVG data in image tags as static assets, disabling all javascript execution natively.

---

## Accomplishments that we're proud of

* **True Context-Isolated Branching**: Users can explore parallel prompts on the same reference document simultaneously without side effects.
* **Fluent Streaming Easing**: The custom organic character typing interpolation feels polished and natural.
* **Decoupled Parallel Execution**: Users can run concurrent, independent streaming requests across multiple branches without cancellation clashes.

---

## What we learned

1. **AI Agents need clear state boundaries**: Vibe coding is incredibly fast but prone to cascading render loop bugs. Explicit state encapsulation (e.g. keeping inputs local) must be designed by the human architect.
2. **Never trust LLM code outputs**: Treating LLM-generated markup (HTML/SVG) as hostile inputs is critical. Static image tag mapping and non-same-origin sandboxed `iframe` rendering are essential to protect client keys.

---

## What's next for ChatTree

* **Interactive Flow Canvas Annotations**: Allowing freeform drawings, grouping containers, and stickies inside the ReactFlow wrapper.
* **WebGPU Offline Models**: Enabling full offline capability via in-browser models.
* **P2P Collaborative Tree Sessions**: Connecting two developer sessions over WebRTC to collaboratively grow and review a chat tree in real-time.
