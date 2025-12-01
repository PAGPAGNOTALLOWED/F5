# Discord Moonsec Deobfuscator Bot - Design Guidelines

## Project Context
This is a **Discord bot application** with no traditional web interface. The primary user interaction occurs entirely within Discord through slash commands and file uploads. Design guidelines focus on bot response formatting and optional admin dashboard.

## Design Approach
**Utility-Focused Design System** - This is a developer tool prioritizing functionality and clarity over visual aesthetics. Following Material Design principles for any auxiliary interfaces.

---

## Bot Response Design (Discord Interface)

### Message Formatting
**Success Responses:**
- Use Discord embeds with green accent color (#43B581)
- Title: "✅ Deobfuscation Complete"
- Include file statistics: original size, deobfuscated size, processing time
- Attach deobfuscated code as `.lua` file
- Footer: timestamp and user who requested

**Error Responses:**
- Red accent color (#F04747)
- Title: "❌ Deobfuscation Failed"
- Clear error description in plain language
- Helpful suggestions for resolution
- No technical stack traces exposed to users

**Processing Responses:**
- Yellow/orange accent color (#FAA61A)
- Loading indicator: "⏳ Processing your file..."
- Edit message when complete (don't spam new messages)

### File Handling
- Maximum file size: 25MB (Discord limit)
- Supported formats: `.lua`, `.txt` files only
- Filename format for output: `deobfuscated_{original_filename}_{timestamp}.lua`

---

## Optional Admin Dashboard (if implemented)

### Layout System
**Spacing:** Use Tailwind units of 4, 6, and 8 (p-4, m-6, h-8)
**Container:** max-w-6xl centered layout

### Typography
**Primary Font:** Inter (Google Fonts)
- Headings: font-semibold, text-2xl to text-4xl
- Body: font-normal, text-base
- Code blocks: JetBrains Mono, text-sm

**Hierarchy:**
- Page Title: text-3xl font-bold
- Section Headers: text-xl font-semibold
- Stats/Metrics: text-4xl font-bold (numbers)
- Labels: text-sm font-medium uppercase tracking-wide

### Component Library

**Dashboard Sections:**
1. **Stats Overview:** 3-column grid showing total deobfuscations, success rate, average processing time
2. **Recent Activity:** Table listing recent `/deobf` commands with username, timestamp, file size, status
3. **Bot Status:** Single card showing uptime, connected servers, active processes

**Navigation:**
- Simple top bar with bot name/logo
- Minimal 2-3 link horizontal menu (Dashboard, Logs, Settings)

**Data Display:**
- Tables with alternating row styling for readability
- Monospace font for filenames and code snippets
- Status badges: small pills with appropriate semantic styling
- Icons: Heroicons via CDN for status indicators (check, x-circle, clock)

### Animations
**Minimal approach:**
- Smooth transitions on hover states (200ms)
- No page transitions or scroll animations
- Loading spinners only for async operations

---

## Key Principles

1. **Developer-First:** Interface optimized for technical users who value speed and clarity
2. **Information Density:** Maximize useful data, minimize decoration
3. **Instant Feedback:** Bot responses within Discord are immediate and informative
4. **Error Transparency:** Clear, actionable error messages without exposing security details
5. **Consistent Patterns:** Reuse Discord's native embed styling patterns for familiarity

---

## Images
**No images required.** This is a utility bot with optional dashboard showing system metrics and logs only.