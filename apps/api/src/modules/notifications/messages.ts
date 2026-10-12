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

/** A live class (D-072): its title and when it starts, for the four live-class notifications. */
interface LiveClassRef {
  id: string;
  title: LocalizedText;
  startsAt: Date;
}

const liveWhen = (startsAt: Date) => {
  const bs = instantToBs(startsAt);
  const time = nepalTime(startsAt);
  return {
    en: `${formatBs(bs, 'en')} at ${time} (Nepal time)`,
    ne: `${formatBs(bs, 'ne')} ${toDevanagariDigits(time)} बजे`,
  };
};

const liveNotification = (
  live: LiveClassRef,
  key: string,
  title: LocalizedText,
  body: LocalizedText,
): OutgoingNotification => ({
  category: 'live_class',
  title,
  body,
  link: { type: 'live', id: live.id },
  sourceKey: `live:${live.id}:${key}`,
  inApp: true,
  push: true,
  email: true,
});

/** A class was published (or its time changed): when it is. */
export function liveScheduledMessage(live: LiveClassRef, changed = false): OutgoingNotification {
  const when = liveWhen(live.startsAt);
  return liveNotification(
    live,
    changed ? `time:${live.startsAt.toISOString()}` : 'scheduled',
    changed
      ? { en: `New time: ${en(live.title)}`, ne: `नयाँ समय: ${ne(live.title)}` }
      : { en: `Live class: ${en(live.title)}`, ne: `लाइभ कक्षा: ${ne(live.title)}` },
    { en: `It starts on ${when.en}.`, ne: `${when.ne} सुरु हुन्छ।` },
  );
}

/** Shortly before the class starts (CMS `live.rules.reminderMinutes`). */
export function liveReminderMessage(live: LiveClassRef, now: Date): OutgoingNotification {
  const lead = leadTime(live.startsAt.getTime() - now.getTime());
  return liveNotification(
    live,
    `reminder:${live.startsAt.toISOString()}`,
    { en: `Starts in ${lead.en}: ${en(live.title)}`, ne: `${lead.ne}मा सुरु हुन्छ: ${ne(live.title)}` },
    {
      en: 'Open the class in the app to join when it starts.',
      ne: 'सुरु भएपछि जोडिन एपमा कक्षा खोल्नुहोस्।',
    },
  );
}

/** The class is live now. */
export function liveNowMessage(live: LiveClassRef): OutgoingNotification {
  return liveNotification(
    live,
    'live',
    { en: `Live now: ${en(live.title)}`, ne: `अहिले लाइभ: ${ne(live.title)}` },
    { en: 'Tap to join the class.', ne: 'कक्षामा जोडिन थिच्नुहोस्।' },
  );
}

/** The class was cancelled. */
export function liveCancelledMessage(live: LiveClassRef): OutgoingNotification {
  const when = liveWhen(live.startsAt);
  return liveNotification(
    live,
    'cancelled',
    { en: `Cancelled: ${en(live.title)}`, ne: `रद्द भयो: ${ne(live.title)}` },
    { en: `The class on ${when.en} will not take place.`, ne: `${when.ne} को कक्षा हुने छैन।` },
  );
}
