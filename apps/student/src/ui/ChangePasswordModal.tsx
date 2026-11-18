import React, { useState } from 'react';
import { Modal, StyleSheet, View, useWindowDimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from './Txt';
import { TextField } from './TextField';
import { Button } from './Button';
import { Banner } from './misc';
import { auth, ApiError } from '@/api/client';

export function ChangePasswordModal() {
  const { session, setSession } = useAuth();
  const { c } = useTheme();
  const { height, width } = useWindowDimensions();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Only open when the logged in user has mustChangePassword === true
  const isOpen = Boolean(session?.user?.mustChangePassword);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setBusy(true);
    try {
      const updatedSession = await auth.setInitialPassword(session!.user.id, newPassword);
      setSession(updatedSession);
      // Clean up fields
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Could not update password. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent>
      <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
        <View style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border, maxHeight: height * 0.88 }]}>
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="key-outline" size={28} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">Set New Password</Txt>
              <Txt variant="caption" color={c.muted}>
                Temporary password change required
              </Txt>
            </View>
          </View>

          <View style={{ gap: 14, marginVertical: 12 }}>
            <Txt color={c.inkSoft} style={{ fontSize: 14, lineHeight: 20 }}>
              Welcome, <Txt variant="bodyStrong">{session?.user.name}</Txt>! You signed in with a temporary password. Please create your own private password to continue.
            </Txt>

            {error && <Banner text={error} />}

            <TextField
              label="New Password"
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setError(null); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="At least 6 characters"
            />

            <TextField
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setError(null); }}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Re-type new password"
            />
          </View>

          <View style={styles.footer}>
            <Button
              title="Save Password & Continue"
              iconRight="arrow-forward"
              size="lg"
              loading={busy}
              onPress={handleSubmit}
              style={{ width: '100%' }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(7, 20, 40, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 99999
  },
  dialog: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 }
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footer: {
    marginTop: 8
  }
});
