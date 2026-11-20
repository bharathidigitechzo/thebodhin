/** Team & tutors: seats vs plan, members with assigned courses, invite (seat-limited), edit access, remove. */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Cols, Grid, useLayout, useFrame } from '@/ui/responsive';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, courseAdmin, teamApi } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { TextField } from '@/ui/TextField';
import { Avatar, BottomSheet, Pill, ProgressBar } from '@/ui/kit';
import { Banner, Checkbox } from '@/ui/misc';
import { Card, ScreenTop, shared } from '@/ui/section';

type Data = ReturnType<typeof teamApi.get>;
type Member = Data['members'][number];

export default function Team() {
  const frame = useFrame(); // shared educator page frame (same width and side spacing on every section)
  const { isDesktop } = useLayout();
  const { c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [inv, setInv] = useState(false);
  const [f, setF] = useState({ name: '', email: '', courseIds: [] as string[] });
  const [edit, setEdit] = useState<Member | null>(null);
  const [editIds, setEditIds] = useState<string[]>([]);
  const [rm, setRm] = useState<Member | null>(null);
  const [fe, setFe] = useState<{ field?: string; msg: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [addingCourse, setAddingCourse] = useState(false);
  const load = useCallback(() => { try { setD(teamApi.get(userId)); } catch (e) { setFe({ msg: e instanceof ApiError ? e.message : 'Not available' }); } }, [userId]);
  useFocusEffect(load);
  if (!d) return <SafeAreaView style={{ flex: 1, backgroundColor: c.ivory, padding: 20 }}>{fe && <Banner text={fe.msg} />}</SafeAreaView>;
  const full = d.seats.limit != null && d.seats.used >= d.seats.limit;
  const title = (ids: string[]) => (ids.length === d.courses.length ? 'All courses' : ids.map((id) => d.courses.find((x) => x.id === id)?.title).filter(Boolean).join(', ') || 'No courses');

  const handleAddNewCourse = () => {
    const trimmed = newCourseName.trim();
    if (!trimmed) return;
    setAddingCourse(true);
    try {
      const courseId = courseAdmin.create(userId);
      courseAdmin.update(userId, courseId, { title: trimmed });
      const updatedData = teamApi.get(userId);
      setD(updatedData);
      setF((prev) => ({
        ...prev,
        courseIds: [...prev.courseIds, courseId]
      }));
      setNewCourseName('');
      setShowAddCourse(false);
    } catch (e: any) {
      setFe({ field: 'courses', msg: e?.message || 'Could not create course.' });
    } finally {
      setAddingCourse(false);
    }
  };

  const invite = async () => {
    setBusy(true);
    setFe(null);
    try {
      const res = await teamApi.invite(userId, f);
      setInv(false);
      setMsg(`Invite sent to ${f.email}. Login credentials emailed (Temp password: ${res?.tempPassword || 'emailed'}).`);
      load();
    } catch (e) {
      setFe(e instanceof ApiError ? { field: e.field, msg: e.message } : { msg: 'Could not invite.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ivory }}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <ScreenTop title="Team & tutors" sub={d.ctx.tenant.branding.displayName} />
        <ScrollView contentContainerStyle={[shared.scroll, { paddingHorizontal: frame.padX }, isDesktop && { paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
          <View style={[shared.inner, { maxWidth: frame.maxWidth }]}>
            {msg && <Banner tone="success" text={msg} />}
            {!d.multiTutor && <Banner tone="info" text="Your plan includes 1 tutor (you). Upgrade to Growth to add tutors." />}
            <Card title="Tutor seats">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt variant="bodyStrong">{d.seats.used} of {d.seats.limit ?? '∞'} used</Txt>
                <Txt variant="caption" color={c.muted}>{d.seats.members} active · {d.invites.length} invited</Txt>
              </View>
              <ProgressBar pct={d.seats.limit ? (d.seats.used / d.seats.limit) * 100 : 0} color={full ? c.danger : c.primary} height={8} />
              {full && <Button title="Add 5 seats" size="md" variant="outline" onPress={() => router.push('/edu/subscription')} />}
            </Card>

            <Card title="Members">
              {d.members.map((m) => (
                <View key={m.u.id} style={styles.member}>
                  <Avatar name={m.u.name} size={42} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{m.u.name}{m.u.id === userId ? ' (you)' : ''}</Txt>
                      <Pill text={m.role === 'owner' ? 'Owner' : 'Tutor'} tone={m.role === 'owner' ? 'gold' : 'info'} />
                    </View>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{m.u.email}</Txt>
                    <Txt variant="caption" color={c.inkSoft} numberOfLines={2}>{title(m.assigned)} · {m.batches} batch{m.batches === 1 ? '' : 'es'}</Txt>
                  </View>
                  {m.role === 'tutor' && (
                    <Pressable onPress={() => { setEdit(m); setEditIds(m.assigned); }} style={styles.icon} accessibilityRole="button" accessibilityLabel={`Edit ${m.u.name}`}>
                      <Ionicons name="create-outline" size={20} color={c.inkSoft} />
                    </Pressable>
                  )}
                </View>
              ))}
              {d.invites.map((i) => (
                <View key={i.id} style={styles.member}>
                  <View style={[styles.pendingAv, { borderColor: c.borderStrong }]}><Ionicons name="mail-outline" size={18} color={c.muted} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{i.name}</Txt>
                      <Pill text="Invited" tone="neutral" />
                    </View>
                    <Txt variant="caption" color={c.muted} numberOfLines={1}>{i.email} · {title(i.courseIds)}</Txt>
                  </View>
                  <Button title="Revoke" size="md" variant="outline" onPress={() => { teamApi.revoke(userId, i.id); load(); }} />
                </View>
              ))}
            </Card>
            <Card title="What tutors can do">
              {['Teach assigned courses: edit lessons, host live classes, mark attendance', 'Grade assignments and answer doubts for those courses', 'Cannot see earnings, payouts, plan, coupons or workspace settings', 'Cannot publish to the marketplace or change prices'].map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                  <Ionicons name={t.startsWith('Cannot') ? 'close-circle-outline' : 'checkmark-circle-outline'} size={18} color={t.startsWith('Cannot') ? c.muted : c.success} />
                  <Txt variant="label" style={{ flex: 1, fontWeight: '400' }}>{t}</Txt>
                </View>
              ))}
            </Card>
          </View>
        </ScrollView>
        <View style={[shared.footer, { borderTopColor: c.border, backgroundColor: c.surface }]}>
          <Button
            title="Invite a tutor"
            iconLeft="person-add"
            disabled={!d.multiTutor || full}
            onPress={() => {
              const allCourseIds = d.courses.filter((co) => !!co.title && co.title.trim().length > 0).map((co) => co.id);
              setInv(true);
              setFe(null);
              setF({ name: '', email: '', courseIds: allCourseIds });
            }}
            style={{ width: '100%', maxWidth: frame.maxWidth }}
          />
        </View>
      </SafeAreaView>

      <BottomSheet
        open={inv}
        onClose={() => setInv(false)}
        title="Invite a tutor"
        footer={<Button title="Send invite" size="md" loading={busy} style={{ flex: 1 }} onPress={invite} />}
      >
        <View style={{ gap: 14 }}>
          {fe && <Banner tone="danger" text={fe.msg} />}
          <TextField label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} error={fe?.field === 'name' ? fe.msg : undefined} placeholder="e.g. Bharathi P" />
          <TextField label="Email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" error={fe?.field === 'email' ? fe.msg : undefined} placeholder="e.g. bharathidigitechzo@gmail.com" />
          
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="label">Courses they’ll teach</Txt>
              {!showAddCourse && (
                <Pressable
                  onPress={() => setShowAddCourse(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border }}
                  accessibilityRole="button"
                  accessibilityLabel="Add new course"
                >
                  <Ionicons name="add-circle" size={16} color={c.primary} />
                  <Txt variant="label" color={c.primary} style={{ fontWeight: '600' }}>+ Add course</Txt>
                </Pressable>
              )}
            </View>

            {showAddCourse && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8, borderRadius: 10, backgroundColor: c.surfaceMuted, borderWidth: 1.5, borderColor: c.primary }}>
                <TextInput
                  value={newCourseName}
                  onChangeText={setNewCourseName}
                  placeholder="Enter new course title..."
                  placeholderTextColor={c.muted}
                  autoFocus
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: c.ink,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: c.surface,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: c.border
                  }}
                  onSubmitEditing={handleAddNewCourse}
                />
                <Button
                  title="Add"
                  loading={addingCourse}
                  onPress={handleAddNewCourse}
                  disabled={!newCourseName.trim()}
                />
                <Pressable onPress={() => { setShowAddCourse(false); setNewCourseName(''); }} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={20} color={c.muted} />
                </Pressable>
              </View>
            )}

            {d.courses.filter((co) => !!co.title && co.title.trim().length > 0).length === 0 ? (
              <View style={{ backgroundColor: c.surfaceMuted, padding: 14, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: c.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sparkles" size={18} color={c.primary} />
                  <Txt variant="bodyStrong">All workspace courses (Co-instructor)</Txt>
                </View>
                <Txt variant="caption" color={c.inkSoft}>
                  You haven’t created specific courses in this workspace yet. When you invite this tutor, they will automatically be granted teaching access to all courses created in this academy.
                </Txt>
              </View>
            ) : (
              <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surfaceMuted, overflow: 'hidden' }}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
                  <Checkbox
                    label="Select all courses"
                    checked={d.courses.filter((co) => !!co.title && co.title.trim().length > 0).length > 0 && f.courseIds.length === d.courses.filter((co) => !!co.title && co.title.trim().length > 0).length}
                    onChange={(v) => setF({ ...f, courseIds: v ? d.courses.filter((co) => !!co.title && co.title.trim().length > 0).map((co) => co.id) : [] })}
                  >
                    <Txt variant="bodyStrong">Select all courses ({d.courses.filter((co) => !!co.title && co.title.trim().length > 0).length})</Txt>
                  </Checkbox>
                </View>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator={true}>
                  {d.courses
                    .filter((co) => !!co.title && co.title.trim().length > 0)
                    .map((co) => (
                      <Checkbox key={co.id} label={co.title} checked={f.courseIds.includes(co.id)} onChange={(v) => setF({ ...f, courseIds: v ? [...f.courseIds, co.id] : f.courseIds.filter((x) => x !== co.id) })}>
                        <Txt variant="body" style={{ flex: 1 }}>{co.title.trim()}</Txt>
                      </Checkbox>
                    ))}
                </ScrollView>
              </View>
            )}
            {fe?.field === 'courses' && <Txt variant="caption" color={c.danger}>{fe.msg}</Txt>}
          </View>
        </View>
      </BottomSheet>

      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.u.name}’s courses` : ''} footer={<>
        <Button title="Remove" size="md" variant="outline" style={{ flex: 1 }} onPress={() => { setRm(edit); setEdit(null); }} />
        <Button title="Save" size="md" style={{ flex: 1 }} onPress={() => { teamApi.setCourses(userId, edit!.u.id, editIds); setEdit(null); setMsg('Access updated.'); load(); }} />
      </>}>
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surfaceMuted, overflow: 'hidden' }}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator={true}>
            {d.courses
              .filter((co) => !!co.title && co.title.trim().length > 0)
              .map((co) => (
                <Checkbox key={co.id} label={co.title} checked={editIds.includes(co.id)} onChange={(v) => setEditIds((x) => (v ? [...x, co.id] : x.filter((y) => y !== co.id)))}>
                  <Txt variant="body" style={{ flex: 1 }}>{co.title.trim()}</Txt>
                </Checkbox>
              ))}
          </ScrollView>
        </View>
      </BottomSheet>

      <BottomSheet open={!!rm} onClose={() => setRm(null)} title={`Remove ${rm?.u.name ?? ''}?`} footer={<>
        <Button title="Cancel" size="md" variant="outline" style={{ flex: 1 }} onPress={() => setRm(null)} />
        <Button title="Remove tutor" size="md" style={{ flex: 1, backgroundColor: c.danger }} onPress={() => { teamApi.remove(userId, rm!.u.id); setMsg(`${rm!.u.name} removed. Their batches moved to you; one seat freed.`); setRm(null); load(); }} />
      </>}>
        <Txt color={c.inkSoft}>They lose access to this workspace immediately. Their {rm?.batches} batch{rm?.batches === 1 ? '' : 'es'} and upcoming classes move to you. Content they created stays.</Txt>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pendingAv: { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
