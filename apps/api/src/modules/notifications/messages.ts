import type { LocalizedText } from '@tk/contracts';
import { formatBs, instantToBs, NEPAL_TIME_ZONE, toDevanagariDigits } from '@tk/domain';
import type { OutgoingNotification } from './notifications.service.js';

/** The texts of event notifications (D-033, D-060), in both languages. */

const en = (t: LocalizedText) => t.en ?? t.ne ?? '';
const ne = (t: LocalizedText) => t.ne ?? t.en ?? '';

/** A payment went through (or a Rs 0 order was made): the receipt itself goes by email (D-057), so no email here. */
export function purchaseMessage(
  order: { id: string; orderNo: number },
  item: LocalizedText,
): OutgoingNotification {
  const no = `#${String(order.orderNo).padStart(6, '0')}`;
  return {
    category: 'purchase',
    title: { en: `Payment received: ${en(item)}`, ne: `भुक्तानी प्राप्त भयो: ${ne(item)}` },
    body: {
      en: `Order ${no} is paid and your access is ready. The receipt is in Profile → Purchases.`,
      ne: `अर्डर ${toDevanagariDigits(no)} को भुक्तानी भयो, अब पढ्न सक्नुहुन्छ। रसिद प्रोफाइल → खरिदहरूमा छ।`,
    },
    link: { type: 'order', id: order.id },
    sourceKey: `order:${order.id}:paid`,
    inApp: true,
    push: true,
    email: false,
  };
}

/** A test result the student has not opened yet is out. */
export function resultMessage(attemptId: string, test: LocalizedText): OutgoingNotification {
  return {
    category: 'result',
    title: { en: `Your result is out: ${en(test)}`, ne: `नतिजा प्रकाशित भयो: ${ne(test)}` },
    body: { en: 'Open it to see your score.', ne: 'आफ्नो अंक हेर्न खोल्नुहोस्।' },
    link: { type: 'attempt', id: attemptId },
    sourceKey: `result:${attemptId}`,
    inApp: true,
    push: true,
    email: true,
  };
}

/** How long until it opens, in the largest whole unit ("1 day", "3 hours", "40 minutes"). */
export function leadTime(ms: number): LocalizedText {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const [n, unitEn, unitNe] =
    minutes >= 1440 - 30
      ? [Math.round(minutes / 1440), 'day', 'दिन']
      : minutes >= 60 - 5
        ? [Math.round(minutes / 60), 'hour', 'घण्टा']
        : [minutes, 'minute', 'मिनेट'];
  return { en: `${n} ${unitEn}${n === 1 ? '' : 's'}`, ne: `${toDevanagariDigits(n)} ${unitNe}` };
}

/** The Nepal-time clock reading of an instant, e.g. "14:30". */
function nepalTime(at: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: NEPAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** Before a scheduled test opens (D-060). */
export function reminderMessage(
  test: { id: string; title: LocalizedText; opensAt: Date },
  minutesBefore: number,
  now: Date,
): OutgoingNotification {
  const lead = leadTime(test.opensAt.getTime() - now.getTime());
  const bs = instantToBs(test.opensAt);
  const time = nepalTime(test.opensAt);
  return {
    category: 'exam_reminder',
    title: {
      en: `Starts in ${lead.en}: ${en(test.title)}`,
      ne: `${lead.ne}मा सुरु हुन्छ: ${ne(test.title)}`,
    },
    body: {
      en: `It opens on ${formatBs(bs, 'en')} at ${time} (Nepal time).`,
      ne: `${formatBs(bs, 'ne')} ${toDevanagariDigits(time)} बजे खुल्छ।`,
    },
    link: { type: 'assessment', id: test.id },
    sourceKey: `reminder:${test.id}:${test.opensAt.toISOString()}:${minutesBefore}`,
    inApp: true,
    push: true,
    email: true,
  };
}

/** Staff's course update (D-060): their words, in whichever languages they wrote. */
export function courseUpdateMessage(
  update: { id: string; title: LocalizedText; message: LocalizedText },
  course: { slug: string },
): OutgoingNotification {
  return {
    category: 'course_update',
    title: update.title,
    body: update.message,
    link: { type: 'course', slug: course.slug },
    sourceKey: `course_update:${update.id}`,
    inApp: true,
    push: true,
    email: true,
  };
}
