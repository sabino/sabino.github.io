# Morphology-aware procedural motion

Research note, 10 September 2026. This describes an implementable foundation, not a claim that arbitrary bodies can automatically perform every action. The central design is **seed → body graph → capabilities → contact schedule → joint pose**. Generate a compatible controller with the body. Recoloring a fixed rig or bobbing a complete creature sprite does not establish this capability.

## What the primary sources establish

| Source                                                                                                                                                                                                       | Supported result and useful boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Hecker et al., _Real-time Motion Retargeting to Highly Varied User-Created Morphologies_, SIGGRAPH 2008](https://chrishecker.com/images/c/cb/Sporeanim-siggraph08.pdf)                                      | Spore binds morphology-independent motion goals to a creature, then uses IK. Its semantic predicates distinguish capabilities such as feet and graspers. Section 4.2 groups legs by length and combines duty factors, phase offsets, and normalized foot trajectories. It includes authored speed/gait mappings for groups of one through six feet and procedural handling for larger groups. Footless creatures use crawl/float heuristics. This is a hybrid system with explicit exceptions, not a universal locomotion discovery algorithm. |
| [Karl Sims, _Evolving Virtual Creatures_, SIGGRAPH 1994](https://www.karlsims.com/papers/siggraph94.pdf)                                                                                                     | A graph-based developmental description generates morphology and a neural controller; simulated task performance selects successful combinations. The lesson is to couple structure and behavior and evaluate them together. A random body is not automatically a functioning walker. The [author's project page](https://www.karlsims.com/evolved-virtual-creatures.html) also exposes failures and exploitation of the fitness setup.                                                                                                        |
| [Aristidou and Lasenby, _FABRIK_, 2011](https://www.andreasaristidou.com/publications/papers/FABRIK.pdf)                                                                                                     | Forward/backward positional updates provide an efficient approach to chain IK without a rotation-matrix solve. The [author's project](https://andreasaristidou.com/FABRIK) supplies the reference context. The method solves a pose problem; it does not choose a gait or guarantee stable locomotion.                                                                                                                                                                                                                                         |
| [Buss and Kim, _Selectively Damped Least Squares for Inverse Kinematics_, 2005, author page and C++ downloads](https://mathweb.ucsd.edu/~sbuss/ResearchWeb/ikmethods/)                                       | Damping and target-distance handling address difficult and unreachable IK goals. The author also provides a mathematical survey. An inspectable copy of the author-attributed implementation is [BussIK in Bullet's official repository](https://github.com/bulletphysics/bullet3/blob/master/examples/ThirdPartyLibs/BussIK/Jacobian.cpp). Numerical convergence and physically sensible contact are separate concerns.                                                                                                                       |
| [Ijspeert et al., _From swimming to walking with a salamander robot driven by a spinal cord model_, Science 2007, official lab explanation](https://www.epfl.ch/labs/biorob/research/amphibious/salamandra/) | Coupled oscillators coordinate axial and limb motion; changing drive produces different locomotion modes in a physical robot. The lab explicitly distinguishes generating rhythmic signals from validating movement of a body in its environment. The [2008 CPG review](https://www.sciencedirect.com/science/article/pii/S0893608008000804) surveys this broader controller family.                                                                                                                                                           |

The recommendations and simplified equations below are an engineering proposal for this game. They are not a reproduction of any complete cited system. Author-hosted FABRIK/Buss PDFs were intermittently unavailable during retrieval; their indexed abstracts and official project descriptions were available. Spore's full PDF and EPFL's project description were inspected.

## Generate structure and function together

An immutable species genome should contain a connected body graph, attachment transforms, segment lengths/radii, joint limits, symmetry/repetition groups, effectors, materials, and motion parameters. Derive random streams by addresses such as `(worldSeed, speciesId, anatomy)` and `(worldSeed, speciesId, gait)`. Changing an eye pattern must not unpredictably change the number of legs.

A useful grammar grows serial trunks, branches, bilateral or radial appendages, membranes, and terminal sensors/effectors. Bound segment counts and lengths and reject disconnected graphs, invalid attachment references, and unsupported cycles. A tree is a reasonable first skeleton; closed loops need additional constraints. This permits nonhumanoid topology rather than assuming a head, torso, and two arms.

Capabilities follow both anatomy and environment. Reachable ground effectors can support walking; a flexible serial trunk can support an undulatory controller; swimming additionally needs a water movement model. Wings do not, by themselves, establish physically valid flight. A fantasy hover capability is legitimate if declared explicitly in the world's rules. Grasping, sensing, attacks, interaction ranges, collision bounds, and game verbs should consume this descriptor too.

Three useful starting grammar/controller combinations are a segmented crawler with variable axial joints, a radial walker with a generated number and arrangement of limbs, and a suspended body with generated fins/tendrils. These are extensible procedures over graphs, not a pool of finished species. They are still a limited controller vocabulary; further morphology coverage needs more generators, validation, and motion rules.

## Coordinate model and contact scheduling

Keep simulation coordinates separate from projection: forward/lateral motion lives on the ground plane, with a third coordinate for height. Solve lengths and contacts there. A conventional isometric projection is `screenX = ox + s(x-z)`, `screenY = oy + s*k(x+z) - s*y`. The renderer can use its existing projection; IK must never measure foreshortened screen-space distances.

For legged motion, let phase `φ` be radians and stride length `L` be ground distance per cycle:

```text
φ_next = φ + 2π * traveledDistance / L
p_i = fract(φ / 2π + phaseOffset_i)
stance when p_i < duty_i
```

Distance-driven phase prevents faster rendering from changing gait and stops locomotion cycling when movement stops. An idle oscillator can remain independent. Speed can select a gait and lift amplitude; changes to stride length need a continuity rule to avoid moving planted contacts.

Staggered phases alone are insufficient for odd, asymmetric, or very short limbs. Schedule the usable contacts and test reachability. For deliberately slow, statically supported motion, require the projected center of mass to stay inside the convex hull of grounded contacts with a margin. One or two point contacts do not enclose an area; running and hopping cannot be certified by this static test. Do not claim physical balance from a visual gait.

During stance, retain a foot's **world-space** touchdown target. During swing, interpolate from its lift-off target to a reachable landing target:

```text
u = (p_i - duty_i) / (1 - duty_i)
s = 3u² - 2u³
footGround = lerp(liftOff, landing, s)
footHeight = terrainHeight(footGround) + 16*h*u²*(1-u)²
```

The lift curve has zero endpoint slope. Predict landing from body velocity, turning velocity at the attachment, and rest stance; reject voids and obstacles and clamp reachable distance. Arbitrary turning or speed changes require persisted foot anchors. A stateless sampler can provide straight-line, constant-stride stance cancellation, but cannot honestly guarantee planted feet for arbitrary root trajectories. Its API should later accept per-effector contact state for that guarantee.

## IK that fits a browser foundation

For a two-bone limb, clamp target distance `d` to the reachable annulus, using a small positive epsilon. Let link lengths be `a,b`, normalized direction from hip to target be `e`, and a stable perpendicular bend direction be `p`:

```text
d = clamp(distance(hip,target), abs(a-b)+epsilon, a+b-epsilon)
along = (a² - b² + d²) / (2d)
height = sqrt(max(0, a² - along²))
joint = hip + along*e + bendSign*height*p
tip = hip + d*e
```

This geometric law-of-cosines form works in a chosen 3D bend plane and preserves both bone lengths. Keep the bend plane stable, guard coincident hip/target positions and nonpositive lengths, and return the reachable tip rather than pretending an unreachable target was attained. Joint limits and self-collision remain additional constraints.

For longer appendages, FABRIK is a suitable next step: place the tip at its goal, walk backward maintaining pairwise link lengths, re-anchor the root, and walk forward maintaining those lengths. Apply constraints and iterate to a bounded tolerance/budget. A starting budget of 6–12 passes is a proposal to measure, not an established performance guarantee.

For competing goals on a shared trunk, a damped Jacobian step is another option:

```text
Δq = Jᵀ (J Jᵀ + λ² I)^-1 (target - currentEffectorPosition)
```

Bound the step and enforce joint limits. Rest-pose bias and task priorities matter because a many-jointed body is often underdetermined. Damping cannot supply a missing support policy, collision model, or movement capability.

## Body waves and genuinely different movement

A simple CPG-style phase network, offered here as a simplified controller rather than a reconstruction of the salamander model, is:

```text
φdot_i = ω_i + Σ_j k_ij*sin(φ_j - φ_i - desiredLag_ij)
Adot_i = α*(desiredAmplitude_i - A_i)
q_i = restAngle_i + A_i*sin(φ_i)
```

Generate oscillator connectivity from anatomical adjacency and functional groups. Inconsistent phase lags around cycles can fight each other; do not assign them independently without checking. A simpler traveling wave for a serial body is `q_j = rest_j + A_j*sin(φ - waveNumber*arcLength_j)`. Forward kinematics must then preserve segment lengths. Crawling and swimming can share a rhythm family but need different contact/drag rules.

Hopping needs synchronized loading, a flight interval, and a landing condition, not alternating feet. A ballistic height `y(t)=y0+v0*t-g*t²/2` is appropriate only if simulation owns the same takeoff, collision, and touchdown events. Hovering uses explicit suspension plus appendage oscillation. Tendrils and antennae can use secondary waves/springs without being mislabeled as propulsive limbs.

For a first kinematic implementation, the gameplay system can move the root while the sampler articulates the body. Label that accurately: it produces morphology-dependent animation, not motion emerging from solved contact forces. The body can be drawn directly as tapered segments, capsules, membranes, eyes, and local-coordinate surface patterns from joint poses, preserving generated silhouette and articulation without a complete pre-rendered creature image.

## Acceptance checks

- Same seed and simulation sample produce exactly the same graph and pose; rendering does not consume the generation RNG.
- Different seeds change measurable topology, attachment counts, proportions, and motion parameters, not only palettes or names.
- All posed joints are finite; solved segment lengths match their specification; unreachable targets remain bounded.
- Test zero speed, coincident targets, extreme proportions, no limbs, odd limb counts, heading wrap, and every supported movement mode.
- A planted-foot test measures world displacement during constant-stride translation. Arbitrary turning tests require persisted anchors before claiming no sliding.
- Slither changes a connected axial chain; hop shares a flight interval; hover has suspension; stride/skitter use distinct duty/phase schedules.
- Terrain contacts, collision bounds, action reach, and available verbs agree with the generated anatomy.
- Fixed-step simulation and bounded solver work are measured with many creatures; rendering LOD must not regenerate anatomy or reset gait.

The immediate mathematical foundation is small enough for browser execution. A fully compositional game additionally needs environment-conditioned body generation, action/mission compatibility, persisted contact state, and broader graph/controller coverage. None of the cited work removes that integration work.
