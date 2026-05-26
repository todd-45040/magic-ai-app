# Apparatus Component Inheritance Patch

Implemented deterministic component inheritance for Illusion Blueprint generation.

## Scope
- Prompt/service layer only.
- No auth, billing, telemetry, schema, routing, or AI infrastructure changes.

## Added
- Component map inheritance.
- Facade inheritance.
- Pedestal/base inheritance.
- Roofline/topline inheritance.
- Apparatus-part persistence rules.
- Stronger render/design spec brief so Blueprint A ↔ Concept A and Blueprint B ↔ Concept B preserve the same visible parts.

## Purpose
Reduce component drift where the image model keeps the general theme but redesigns roof, facade, base, caster layout, trim, or panel geometry.
