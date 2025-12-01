# Moonsec V3 Discord Deobfuscator Bot

## Overview

A full-stack Discord bot for deobfuscating Moonsec V3 obfuscated Lua files. Users submit obfuscated files via `/deobf` command and receive deobfuscated bytecode with statistics and extracted links.

**Features:**
- `/deobf` slash command with file attachment support
- Processes Moonsec V3 obfuscated Lua files (.lua, .txt)
- Token-based rate limiting (3 free tokens per user, 2 tokens per 24 hours)
- `/gift` command for admins to gift tokens
- Beautiful Discord embeds with processing status and statistics
- Extracted links from deobfuscated content
- "Decompile The Output Code" button linking to https://luadec.metaworm.site/

## Quick Start for pella.app

### Prerequisites
1. **Discord Bot Setup:**
   - Go to https://discord.com/developers/applications
   - Create a new application
   - Copy the **Client ID** and create/copy the **Bot Token**
   - Add the bot to your servers

2. **GitHub Setup:**
   - Fork or clone this repository to GitHub

### Deployment on pella.app

1. **Connect GitHub repo** to pella.app
2. **Add Environment Variables:**
   - `DISCORD_TOKEN` - Your Discord bot token
   - `DISCORD_CLIENT_ID` - Your Discord application client ID
   - (Optional) `DATABASE_URL` - PostgreSQL connection string for persistent storage

3. **Deploy:**
   - pella.app will run: `npm run build && npm start`
   - Bot will start automatically and register slash commands

### Environment Variables Explained

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | ✅ Yes | Bot authentication token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | ✅ Yes | Application Client ID from Discord Developer Portal |
| `DATABASE_URL` | ❌ Optional | PostgreSQL connection string. If omitted, uses in-memory storage |

## Architecture

### Frontend
- **React 18** with Tailwind CSS
- Radix UI components
- Responsive design

### Backend
- **Node.js + Express** - REST API and Discord bot
- **Discord.js** - Discord bot framework
- **PostgreSQL** (optional) - Token persistence
- **C# Deobfuscator** - Moonsec V3 deobfuscation engine

### File Structure

```
.
├── server/
│   ├── discord-bot.ts      # Discord bot & commands
│   ├── app.ts              # Express server
│   ├── index-dev.ts        # Development entry
│   └── index-prod.ts       # Production entry
├── client/
│   └── src/                # React frontend
├── shared/
│   └── schema.ts           # Shared types
├── attached_assets/
│   ├── MoonsecDeobfuscator/  # C# deobfuscator binary
│   └── luadec51/             # Lua decompiler
└── package.json            # Dependencies
```

## Development

### Local Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Start Production Server
```bash
npm start
```

## Command Reference

### `/deobf`
Deobfuscate a Moonsec V3 file
- **Parameter:** `file` - The obfuscated .lua or .txt file
- **Tokens:** Uses 1 token per deobfuscation
- **Returns:** Deobfuscated file with statistics

### `/gift` (Admin only)
Gift tokens to another user
- **Parameters:** 
  - `member` - User to gift tokens to
  - `amount` - Number of tokens to gift
- **Requires:** Gift role (ID: 1441821570266955858)

## Supported Features

✅ Moonsec V3 obfuscation only  
✅ Max file size: 25MB (Discord limit)  
✅ Lua 5.1 bytecode output  
✅ Link extraction from code  
✅ Token-based rate limiting  
✅ In-memory token storage (no database required)  
✅ Optional PostgreSQL for persistence  

## Notes

- Token data resets on restart if `DATABASE_URL` is not configured
- For production, configure `DATABASE_URL` for persistent token storage
- Bot only works on authorized servers (see discord-bot.ts `allowedServers`)
- Ensure bot has permission to manage roles if using `/gift` command

## Troubleshooting

**Bot not responding?**
- Check if DISCORD_TOKEN and DISCORD_CLIENT_ID are correct
- Verify bot is added to your Discord server
- Check bot has required permissions

**Commands not showing?**
- Wait 1 minute for Discord to sync global commands
- Or restart the bot

**Deobfuscation fails?**
- Ensure file is Moonsec V3 obfuscated
- Check file is valid .lua or .txt
- File size under 25MB
