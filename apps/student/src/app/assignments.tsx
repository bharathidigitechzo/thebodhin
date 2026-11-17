/** Student portal → Assignments: every assignment of the courses you bought (appears as soon as the tutor publishes it). */
import React from 'react';
import { assessments } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { useAsync } from '@/ui/kit';
import { Page } from '@/ui/grow';
import { Assessments } from '@/ui/assessList';
import { useFocusEffect } from 'expo-router';

export default function AssignmentsPage() {
  const { session } = useAuth();
  const { tenant } = useTheme();
  const userId = session?.user.id ?? '';
  const as = useAsync(() => assessments.list(userId, tenant?.id ?? null), [userId, tenant?.id]);
  useFocusEffect(React.useCallback(() => { as.reload(); }, [as.reload])); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Page title="Assignments" sub="From the courses you bought" fallback="/learning">
      <Assessments data={as.data} error={as.error} reload={as.reload} only="assignment" />
    </Page>
  );
}
