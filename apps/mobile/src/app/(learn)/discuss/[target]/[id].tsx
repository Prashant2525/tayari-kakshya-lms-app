import type { DiscussionPostView, DiscussionTarget, ReportReason } from '@tk/contracts';
import { radius } from '@tk/design-tokens';
import { useLocalSearchParams } from 'expo-router';
import { BadgeCheck, MessagesSquare, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useDeletePost, usePostToThread, useReportPost, useThread } from '@/api/discussions';
import type { MessageKey } from '@/i18n/en';
import { useT } from '@/i18n/use-t';
import { ApiError } from '@/lib/api-client';
import { bsDate, bsDateTime } from '@/lib/dates';
import { errorMessageKey } from '@/lib/error-message';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/button';
import { Dialog } from '@/ui/dialog';
import { BackButton, Banner, Card, Screen, Skeleton } from '@/ui/layout';
import { EmptyState, ErrorState } from '@/ui/states';
import { Text } from '@/ui/text';
import { TextField } from '@/ui/text-field';

const REASONS: ReportReason[] = ['spam', 'rude', 'wrong', 'other'];

/** The discussion under a question or a lesson (S12, D-066): doubts newest first, each with its replies. */
export default function DiscussionScreen() {
  const params = useLocalSearchParams<{ target: string; id: string; title?: string }>();
  const target: DiscussionTarget = params.target === 'lesson' ? 'lesson' : 'question';
  const { t, locale } = useT();
  const { colors } = useTheme();
  const thread = useThread(target, params.id);
  const [reporting, setReporting] = useState<string | null>(null);
  const first = thread.data?.pages[0];
  const posts = thread.data?.pages.flatMap((p) => p.data) ?? [];
  const locked = thread.error instanceof ApiError && thread.error.status === 403;

  return (
    <Screen edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text variant="h3" role="heading">
            {first ? t('discuss.openCount', { count: first.count }) : t('discuss.title')}
          </Text>
          {params.title ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {params.title}
            </Text>
          ) : null}
        </View>
      </View>
      {thread.isPending ? (
        <Skeleton height={160} />
      ) : locked ? (
        <EmptyState icon={MessagesSquare} title={t('discuss.locked')} />
      ) : thread.isError ? (
        <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text variant="bodySm" color="textSecondary">
            {t('discuss.intro')}
          </Text>
          {first?.canPost ? (
            <Composer target={target} id={params.id} label={t('discuss.ask')} />
          ) : (
            <Banner
              tone="warning"
              message={
                first?.bannedUntil
                  ? t('discuss.banned', { date: bsDate(first.bannedUntil, locale) })
                  : t('discuss.bannedForever')
              }
            />
          )}
          {posts.length === 0 ? (
            <Text variant="body" color="textSecondary">
              {t('discuss.empty')}
            </Text>
          ) : (
            posts.map((p) => (
              <Card key={p.id} style={{ gap: 8 }}>
                <PostBody post={p} target={target} threadId={params.id} onReport={setReporting} />
                {p.replies.map((r) => (
                  <View key={r.id} style={[styles.reply, { borderLeftColor: colors.border }]}>
                    <PostBody post={r} target={target} threadId={params.id} onReport={setReporting} />
                  </View>
                ))}
                {first?.canPost && !p.deleted ? <ReplyBox target={target} id={params.id} post={p} /> : null}
              </Card>
            ))
          )}
          {thread.hasNextPage ? (
            <Button
              label={t('practice.loadMore')}
              variant="secondary"
              size="md"
              loading={thread.isFetchingNextPage}
              onPress={() => void thread.fetchNextPage()}
            />
          ) : null}
        </ScrollView>
      )}
      {reporting ? <ReportDialog postId={reporting} onClose={() => setReporting(null)} /> : null}
    </Screen>
  );
}

function PostBody({
  post,
  target,
  threadId,
  onReport,
}: {
  post: DiscussionPostView;
  target: DiscussionTarget;
  threadId: string;
  onReport: (id: string) => void;
}) {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const remove = useDeletePost(target, threadId);
  if (post.deleted) {
    return (
      <Text variant="bodySm" color="textMuted" style={{ fontStyle: 'italic' }}>
        {t('discuss.deleted')}
      </Text>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.meta}>
        <Text variant="label">{post.mine ? t('discuss.you') : post.author}</Text>
        {post.staff ? (
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
            <BadgeCheck size={12} color={colors.onPrimarySoft} strokeWidth={2.25} />
            <Text variant="caption" style={{ color: colors.onPrimarySoft }}>
              {t('discuss.teacher')}
            </Text>
          </View>
        ) : null}
        {post.best ? (
          <View style={[styles.badge, { backgroundColor: colors.successSoft }]}>
            <Star size={12} color={colors.success} fill={colors.success} strokeWidth={2.25} />
            <Text variant="caption" style={{ color: colors.success }}>
              {t('discuss.best')}
            </Text>
          </View>
        ) : null}
        <Text variant="caption" color="textMuted">
          {bsDateTime(post.createdAt, locale)}
        </Text>
      </View>
      <Text variant="body">{post.body}</Text>
      <View style={styles.actions}>
        {post.mine ? (
          <Pressable role="button" onPress={() => remove.mutate(post.id)} hitSlop={8} style={styles.action}>
            <Text variant="caption" color="textSecondary">
              {t('discuss.delete')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            role="button"
            aria-label={`${t('discuss.report')}: ${post.author}`}
            onPress={() => onReport(post.id)}
            hitSlop={8}
            style={styles.action}
          >
            <Text variant="caption" color="textSecondary">
              {t('discuss.report')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Composer({ target, id, label }: { target: DiscussionTarget; id: string; label: string }) {
  const { t } = useT();
  const send = usePostToThread(target, id);
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const submit = () => {
    if (body.trim().length < 2) return setProblem('discuss.tooShort');
    setProblem(null);
    send.mutate(
      { body: body.trim() },
      { onSuccess: () => setBody(''), onError: (e) => setProblem(errorMessageKey(e)) },
    );
  };
  return (
    <View style={{ gap: 8 }}>
      <TextField
        label={label}
        value={body}
        onChangeText={setBody}
        rows={3}
        maxLength={2000}
        placeholder={t('discuss.askPlaceholder')}
      />
      {problem ? <Banner message={t(problem)} /> : null}
      <Button label={t('discuss.send')} size="md" loading={send.isPending} onPress={submit} />
    </View>
  );
}

function ReplyBox({ target, id, post }: { target: DiscussionTarget; id: string; post: DiscussionPostView }) {
  const { t } = useT();
  const send = usePostToThread(target, id);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [problem, setProblem] = useState<MessageKey | null>(null);
  if (!open) {
    return (
      <Pressable role="button" onPress={() => setOpen(true)} hitSlop={8} style={styles.action}>
        <Text variant="label" color="link">
          {t('discuss.reply')}
        </Text>
      </Pressable>
    );
  }
  const submit = () => {
    if (body.trim().length < 2) return setProblem('discuss.tooShort');
    setProblem(null);
    send.mutate(
      { body: body.trim(), parentId: post.id },
      {
        onSuccess: () => {
          setBody('');
          setOpen(false);
        },
        onError: (e) => setProblem(errorMessageKey(e)),
      },
    );
  };
  return (
    <View style={{ gap: 8 }}>
      <TextField
        label={post.mine ? t('discuss.replyLabel') : t('discuss.replyTo', { name: post.author })}
        value={body}
        onChangeText={setBody}
        rows={2}
        maxLength={2000}
        autoFocus
      />
      {problem ? <Banner message={t(problem)} /> : null}
      <View style={styles.row}>
        <Button label={t('discuss.cancel')} variant="tertiary" size="md" onPress={() => setOpen(false)} />
        <Button label={t('discuss.send')} size="md" loading={send.isPending} onPress={submit} />
      </View>
    </View>
  );
}

function ReportDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { t } = useT();
  const { colors } = useTheme();
  const report = useReportPost();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [message, setMessage] = useState('');
  return (
    <Dialog visible title={t('discuss.reportTitle')} onClose={onClose}>
      {report.isSuccess ? (
        <View style={{ gap: 12 }}>
          <Banner tone="success" message={t('discuss.reported')} />
          <Button label={t('common.close')} variant="secondary" onPress={onClose} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View role="radiogroup" aria-label={t('discuss.reportTitle')} style={{ gap: 6 }}>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                role="radio"
                aria-checked={reason === r}
                onPress={() => setReason(r)}
                style={[
                  styles.option,
                  {
                    borderColor: reason === r ? colors.primary : colors.border,
                    backgroundColor: reason === r ? colors.primarySoft : colors.surface,
                  },
                ]}
              >
                <Text variant="body">{t(`discuss.reason.${r}`)}</Text>
              </Pressable>
            ))}
          </View>
          <TextField
            label={t('discuss.reportMessage')}
            value={message}
            onChangeText={setMessage}
            rows={2}
            maxLength={500}
          />
          {report.isError ? <Banner message={t(errorMessageKey(report.error))} /> : null}
          <Button
            label={t('discuss.reportSend')}
            loading={report.isPending}
            onPress={() => report.mutate({ postId, reason, message: message.trim() || null })}
          />
        </View>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { gap: 12, paddingBottom: 32 },
  reply: { marginLeft: 12, paddingLeft: 12, borderLeftWidth: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    borderRadius: radius.full,
  },
  actions: { flexDirection: 'row', gap: 16 },
  action: { minHeight: 32, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  option: { borderWidth: 1, borderRadius: radius.md, padding: 12 },
});
