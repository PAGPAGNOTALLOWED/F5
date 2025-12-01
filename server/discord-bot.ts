import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import pkg from 'pg';
const { Pool } = pkg;

const execAsync = promisify(exec);

const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DATABASE_URL = process.env.DATABASE_URL;
const DEOBFUSCATOR_PATH = path.join(process.cwd(), 'attached_assets/MoonsecDeobfuscator-master/bin/Release/net8.0/MoonsecDeobfuscator');
const LUADEC_PATH = path.join(process.cwd(), 'attached_assets/luadec51/build/luadec');
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Gift role - admins can gift tokens
const GIFT_ROLE = '1441821570266955858';

// Database pool (optional)
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

// In-memory token storage (fallback when no database)
const memoryTokens = new Map<string, { tokens: number; lastDailyClaim: number }>();

// Initialize database tables
async function initializeDatabase() {
  if (!pool) {
    console.log('⚠️ No DATABASE_URL provided - using in-memory storage');
    return;
  }
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        user_id VARCHAR(255) PRIMARY KEY,
        tokens INT DEFAULT 3,
        last_daily_claim BIGINT DEFAULT 0,
        updated_at BIGINT
      )
    `);
    console.log('✅ Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Get or create user tokens
async function getUserTokens(userId: string): Promise<number> {
  // Use in-memory storage if no database
  if (!pool) {
    if (!memoryTokens.has(userId)) {
      memoryTokens.set(userId, { tokens: 3, lastDailyClaim: Date.now() });
    }
    return memoryTokens.get(userId)!.tokens;
  }
  
  try {
    const result = await pool.query(
      'SELECT tokens FROM user_tokens WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create new user with 3 free tokens
      await pool.query(
        'INSERT INTO user_tokens (user_id, tokens, updated_at) VALUES ($1, $2, $3)',
        [userId, 3, Date.now()]
      );
      return 3;
    }
    
    return result.rows[0].tokens;
  } catch (error) {
    console.error('Error getting user tokens:', error);
    return 0;
  }
}

// Deduct tokens
async function deductTokens(userId: string): Promise<boolean> {
  try {
    const currentTokens = await getUserTokens(userId);
    
    if (currentTokens < 1) {
      return false;
    }
    
    if (!pool) {
      const user = memoryTokens.get(userId);
      if (user) user.tokens -= 1;
      return true;
    }
    
    await pool.query(
      'UPDATE user_tokens SET tokens = tokens - 1, updated_at = $1 WHERE user_id = $2',
      [Date.now(), userId]
    );
    
    return true;
  } catch (error) {
    console.error('Error deducting tokens:', error);
    return false;
  }
}

// Check and add daily tokens (2 tokens per 24 hours)
async function claimDailyTokens(userId: string): Promise<void> {
  try {
    if (!pool) {
      const user = memoryTokens.get(userId);
      if (user) {
        const now = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        if (now - user.lastDailyClaim >= TWENTY_FOUR_HOURS) {
          user.tokens += 2;
          user.lastDailyClaim = now;
        }
      }
      return;
    }
    
    const result = await pool.query(
      'SELECT last_daily_claim FROM user_tokens WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length > 0) {
      const { last_daily_claim } = result.rows[0];
      const now = Date.now();
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
      
      if (now - last_daily_claim >= TWENTY_FOUR_HOURS) {
        // Add 2 tokens
        await pool.query(
          'UPDATE user_tokens SET tokens = tokens + 2, last_daily_claim = $1, updated_at = $1 WHERE user_id = $2',
          [now, userId]
        );
      }
    }
  } catch (error) {
    console.error('Error claiming daily tokens:', error);
  }
}

// Add tokens (for /gift command)
async function addTokens(userId: string, amount: number): Promise<boolean> {
  try {
    await getUserTokens(userId); // Ensure user exists
    
    if (!pool) {
      const user = memoryTokens.get(userId);
      if (user) user.tokens += amount;
      return true;
    }
    
    await pool.query(
      'UPDATE user_tokens SET tokens = tokens + $1, updated_at = $2 WHERE user_id = $3',
      [amount, Date.now(), userId]
    );
    return true;
  } catch (error) {
    console.error('Error adding tokens:', error);
    return false;
  }
}

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}

// Register slash commands on specific servers only
export async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('deobf')
      .setDescription('Deobfuscate a Moonsec obfuscated Lua file')
      .addAttachmentOption(option =>
        option
          .setName('file')
          .setDescription('The Moonsec obfuscated Lua file to deobfuscate')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('gift')
      .setDescription('Gift tokens to a member')
      .addUserOption(option =>
        option
          .setName('member')
          .setDescription('The member to gift tokens to')
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName('amount')
          .setDescription('Number of tokens to gift')
          .setRequired(true)
          .setMinValue(1)
      )
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    // Clear all global commands
    console.log('Clearing global commands...');
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: [] });

    // Register commands only on specific servers
    const allowedServers = ['1441808704876970026', '1350403770986528779'];
    for (const guildId of allowedServers) {
      try {
        console.log(`Registering commands on server: ${guildId}`);
        await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId), { body: commands });
        console.log(`✅ Commands registered on server: ${guildId}`);
      } catch (error: any) {
        console.error(`⚠️ Failed to register on server ${guildId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Extract HTTP/HTTPS links from content
function extractLinks(content: Buffer | string): string[] {
  const text = typeof content === 'string' ? content : content.toString('utf-8', 0, Math.min(content.length, 1000000)); // Read max 1MB to avoid performance issues
  
  // Match only valid URL characters: alphanumeric, and URL-safe special characters
  // This stops automatically at code syntax like quotes, brackets, parentheses
  const urlRegex = /https?:\/\/[a-zA-Z0-9\-._~:/?#@!$&'*+,;=%]+/g;
  const matches = text.match(urlRegex) || [];
  
  // Additional cleanup: remove any remaining trailing punctuation
  const cleanedUrls = matches.map(url => {
    return url.replace(/[.,;:!?%]+$/, ''); // Only remove trailing punctuation
  });
  
  return Array.from(new Set(cleanedUrls)); // Remove duplicates
}

// Download file from Discord
async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'arraybuffer',
  });
  await fs.writeFile(outputPath, response.data);
}

// Sanitize filename to prevent path traversal
function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename);
  return basename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Deobfuscate file using the C# tool
async function deobfuscateFile(inputPath: string, outputPath: string): Promise<{ stdout: string; stderr: string }> {
  const command = `dotnet ${DEOBFUSCATOR_PATH}.dll -dev -i "${inputPath}" -o "${outputPath}"`;
  
  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr };
  } catch (error: any) {
    throw new Error(error.stderr || error.message);
  }
}

// Start the Discord bot
export async function startBot() {
  await ensureTempDir();
  await initializeDatabase();
  await registerCommands();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once('clientReady', () => {
    console.log(`✅ Discord bot logged in as ${client.user?.tag}`);
    console.log(`🤖 Bot is ready to deobfuscate Moonsec files!`);
    console.log(`🔒 Commands only work on servers: 1441808704876970026, 1350403770986528779`);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Gift command
    if (interaction.commandName === 'gift') {
      // Check if user has gift role
      if (!interaction.member) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ Access Denied')
              .setDescription('Unable to verify your roles.')
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
        return;
      }

      const userRoles = 'cache' in interaction.member.roles 
        ? interaction.member.roles.cache.map((r: any) => r.id) 
        : interaction.member.roles;
      
      if (!userRoles.includes(GIFT_ROLE)) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ Access Denied')
              .setDescription('You do not have permission to gift tokens.')
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
        return;
      }

      const targetUser = interaction.options.getUser('member', true);
      const amount = interaction.options.getInteger('amount', true);

      try {
        await addTokens(targetUser.id, amount);
        const newTokens = await getUserTokens(targetUser.id);

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x43B581)
              .setTitle('✅ Tokens Gifted')
              .setDescription(`Gifted **${amount}** tokens to ${targetUser.toString()}`)
              .addFields(
                { name: 'New Balance', value: `${newTokens} tokens`, inline: true }
              )
              .setFooter({ text: `Gifted by ${interaction.user.tag}` })
              .setTimestamp()
          ],
        });
        console.log(`[GIFT] ${interaction.user.tag} gifted ${amount} tokens to ${targetUser.tag}`);
      } catch (error) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ Error')
              .setDescription('Failed to gift tokens.')
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
      }
      return;
    }

    // Deobf command
    if (interaction.commandName === 'deobf') {
      const startTime = Date.now();
      
      // Check and claim daily tokens
      await claimDailyTokens(interaction.user.id);
      
      // Check if user has tokens
      const userTokens = await getUserTokens(interaction.user.id);
      if (userTokens < 1) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ Insufficient Tokens')
              .setDescription(`You have **0 tokens**. You get 2 free tokens every 24 hours. Come back tomorrow!`)
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
        return;
      }
      
      // Get the file attachment from the command option
      const attachment = interaction.options.getAttachment('file', true);
      
      if (!attachment) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ Deobfuscation Failed')
              .setDescription('Please attach a Lua file to deobfuscate.\n\nUsage: `/deobf file:[your-file.lua]`')
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
        return;
      }

      // Validate file size (25MB Discord limit)
      const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
      if (attachment.size > MAX_FILE_SIZE) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ File Too Large')
              .setDescription(`File size: **${(attachment.size / 1024 / 1024).toFixed(2)} MB**\nMaximum allowed: **25 MB**\n\nPlease upload a smaller file.`)
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
        return;
      }

      // Validate file type
      const validExtensions = ['.lua', '.txt'];
      const fileExtension = path.extname(attachment.name).toLowerCase();
      if (!validExtensions.includes(fileExtension)) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xF04747)
              .setTitle('❌ Invalid File Type')
              .setDescription(`File type: **${fileExtension || 'unknown'}**\nAccepted types: **.lua, .txt**\n\nPlease upload a Lua or text file.`)
              .setFooter({ text: `Requested by ${interaction.user.tag}` })
              .setTimestamp()
          ],
          ephemeral: true,
        });
        return;
      }

      // Defer reply since processing might take time
      await interaction.deferReply();

      // Show processing message
      const processingEmbed = new EmbedBuilder()
        .setColor(0xFAA61A)
        .setTitle('⏳ Processing your file...')
        .setDescription(`File: **${attachment.name}**\nSize: **${(attachment.size / 1024).toFixed(2)} KB**`)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [processingEmbed] });

      // Use UUID for temp files to prevent path traversal
      const requestId = randomUUID();
      const sanitizedName = sanitizeFilename(attachment.name);
      const inputFilePath = path.join(TEMP_DIR, `input_${requestId}_${sanitizedName}`);
      const outputFilePath = path.join(TEMP_DIR, `output_${requestId}.lua`);

      console.log(`[${requestId}] Processing deobfuscation request for ${attachment.name} (${(attachment.size / 1024).toFixed(2)} KB)`);

      try {
        // Download the file
        await downloadFile(attachment.url, inputFilePath);
        const originalSize = (await fs.stat(inputFilePath)).size;

        // Deobfuscate
        const { stdout, stderr } = await deobfuscateFile(inputFilePath, outputFilePath);
        
        // Log deobfuscator output for debugging
        if (stdout) console.log('Deobfuscator stdout:', stdout);
        if (stderr) console.log('Deobfuscator stderr:', stderr);

        // Read deobfuscated file
        const deobfuscatedContent = await fs.readFile(outputFilePath);
        const deobfuscatedSize = deobfuscatedContent.length;

        // Deduct token
        await deductTokens(interaction.user.id);
        const remainingTokens = await getUserTokens(interaction.user.id);

        const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

        // Create attachment with sanitized name
        const resultAttachment = new AttachmentBuilder(deobfuscatedContent, {
          name: `deobfuscated_${sanitizedName.replace(/\.[^/.]+$/, '')}_${Date.now()}.lua`,
        });

        // Create decompile button
        const decompileButton = new ButtonBuilder()
          .setLabel('Decompile The Output Code')
          .setURL('https://luadec.metaworm.site/')
          .setStyle(ButtonStyle.Link);

        const actionRow = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(decompileButton);

        // Extract links from deobfuscated content
        const links = extractLinks(deobfuscatedContent);

        // Success embed
        const successEmbed = new EmbedBuilder()
          .setColor(0x43B581)
          .setTitle('✅ Deobfuscation Complete')
          .setDescription(`Successfully deobfuscated **${attachment.name}**`)
          .addFields(
            { name: 'Original Size', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
            { name: 'Deobfuscated Size', value: `${(deobfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
            { name: 'Processing Time', value: `${processingTime}s`, inline: true },
            { name: 'Tokens Left', value: `**${remainingTokens}** tokens`, inline: true }
          );

        // Add links to embed if found
        if (links.length > 0) {
          successEmbed.addFields(
            { name: 'Found Links', value: links.join('\n'), inline: false }
          );
        }

        successEmbed
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.editReply({ 
          embeds: [successEmbed],
          files: [resultAttachment],
          components: [actionRow],
        });

        console.log(`[${requestId}] Deobfuscation completed successfully in ${processingTime}s`);

      } catch (error) {
        console.error(`[${requestId}] Deobfuscation error:`, error);

        const errorEmbed = new EmbedBuilder()
          .setColor(0xF04747)
          .setTitle('❌ Deobfuscation Failed')
          .setDescription('⚠️ **Only Moonsec V3 supported**\n\nMake sure you\'re uploading a valid Moonsec V3 obfuscated file.')
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
      } finally {
        // Always cleanup temp files, even if there was an error
        await fs.unlink(inputFilePath).catch(() => {});
        await fs.unlink(outputFilePath).catch(() => {});
      }
    }
  });

  client.login(DISCORD_TOKEN);
  
  return client;
}
