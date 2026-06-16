import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import GlobalBan from '../models/GlobalBan.js';
import { hasPermission } from '../lib/permissions.js';
import { sendGlobalLog, logEmbed } from '../lib/logger.js';

// Add server IDs here that should be EXEMPT from global bans
const EXEMPT_GUILD_IDS = [
  // '123456789012345678',
  // '987654321098765432',
];

export const data = new SlashCommandBuilder()
  .setName('globalban')
  .setDescription('Globally ban a user from all servers the bot is in')
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('User to globally ban')
      .setRequired(true)
  )
  .addStringOption(opt =>
    opt.setName('reason')
      .setDescription('Reason for the global ban')
      .setRequired(false)
  );

export async function execute(interaction) {
  const allowed = await hasPermission(interaction, 'globalban');
  if (!allowed) {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xF5C400).setDescription('❌ You do not have permission to use `/globalban`.')],
      ephemeral: true,
    });
  }

  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  await interaction.deferReply({ ephemeral: true });

  await GlobalBan.findOneAndUpdate(
    { userId: target.id },
    { userId: target.id, username: target.tag, reason, bannedBy: interaction.user.tag, bannedAt: new Date() },
    { upsert: true, new: true }
  );

  try {
    const banDmEmbed = new EmbedBuilder()
      .setTitle('🔨 You Have Been Globally Banned')
      .setColor(0xe74c3c)
      .setDescription(
        `You have been **permanently banned** from all **IMPERIUM** network servers.\n\n` +
        `If you believe this was a mistake, you may submit a ban appeal below.`
      )
      .addFields(
        { name: 'Reason',     value: reason },
        { name: 'Ban Appeal', value: 'https://discord.gg/vTURGtbr6E' },
      )
      .setFooter({ text: 'IMPERIUM Network — This action was reviewed by staff.' })
      .setTimestamp();

    await target.send({ embeds: [banDmEmbed] });
  } catch {
    // DMs disabled or bot shares no server with user — silent fail
  }

  let banned = 0;
  let failed = 0;
  let skipped = 0;

  for (const guild of interaction.client.guilds.cache.values()) {
    if (EXEMPT_GUILD_IDS.includes(guild.id)) {
      skipped++;
      continue;
    }
    try {
      await guild.bans.create(target.id, { reason: `[Auto Global Ban from IMPERIUM Admin Bot] ${reason} | By: ${interaction.user.tag}` });
      banned++;
    } catch {
      failed++;
    }
  }

  const fields = [
    { name: 'Reason',    value: reason },
    { name: 'Banned in', value: `${banned} server(s)`, inline: true },
    { name: 'Failed',    value: `${failed} server(s)`, inline: true },
  ];

  if (skipped > 0) {
    fields.push({ name: 'Skipped (exempt)', value: `${skipped} server(s)`, inline: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔨 Global Ban Applied')
    .setColor(0x000000)
    .setDescription(`**${target.tag}** has been globally banned.`)
    .addFields(fields)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  await sendGlobalLog(interaction.client, logEmbed(
    '🔨 Global Ban',
    `**${interaction.user.tag}** globally banned **${target.tag}** (\`${target.id}\`)`,
    0x000000,
    [{ name: 'Reason', value: reason }, { name: 'Servers', value: `${banned} banned, ${failed} failed, ${skipped} skipped` }]
  ));
}
