import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { supabaseAdmin } from './supabaseAdmin';

const expo = new Expo();

export async function sendDailyCardPush(userId: string, lines: string[], imageUrl?: string) {
  // 1) Find all device tokens for this user
  const { data: tokens, error } = await supabaseAdmin
    .from('device_tokens')
    .select('expo_token')
    .eq('user_id', userId);
  if (error) throw error;

  const valid = (tokens ?? [])
    .map(t => t.expo_token)
    .filter(t => Expo.isExpoPushToken(t));

  if (!valid.length) {
    console.log('No Expo tokens for user', userId);
    return { sent: 0 };
  }

  // 2) Build push messages
  const body = (lines && lines.length >= 2) ? `${lines[0]}\n${lines[1]}` : 'Your two lines are ready';
  const messages: ExpoPushMessage[] = valid.map(to => ({
    to,
    title: 'Your two lines for today ✨',
    body,
    data: { deeplink: 'dreamloop://today?play=1' },
    sound: null,
    channelId: 'daily-card',
    ...(imageUrl ? { _web: { image: imageUrl } } : {}), // Android displays rich image; iOS may thumbnail
  }));

  // 3) Send
  const chunks = expo.chunkPushNotifications(messages);
  let sent = 0;
  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      sent += receipts.length;
    } catch (e) {
      console.error('Push send error:', e);
    }
  }
  return { sent };
}
