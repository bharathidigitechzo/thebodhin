/**
 * Modal to preview and open student assignment PDFs and uploaded documents.
 * Works on Web (embedded iframe + open in new tab + download) and Native (Linking/Sharing).
 */
import React from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';
import { Button } from '@/ui/Button';
import { IconButton, Pill } from '@/ui/kit';

export interface PreviewFile {
  name: string;
  sizeMb?: number;
  uri?: string;
}

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  file: PreviewFile | null;
  studentName?: string;
  assignmentTitle?: string;
}

export function PdfPreviewModal({ open, onClose, file, studentName, assignmentTitle }: PdfPreviewModalProps) {
  const { c } = useTheme();

  if (!open || !file) return null;

  const ext = (file.name.split('.').pop() ?? 'PDF').toUpperCase();
  const isPdf = ext === 'PDF';
  const isImage = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(ext);

  const openExternal = () => {
    if (file.uri) {
      if (Platform.OS === 'web') {
        window.open(file.uri, '_blank');
      } else {
        Linking.openURL(file.uri).catch(() => {});
      }
    } else {
      // If no raw URI, create a blob window on web
      if (Platform.OS === 'web') {
        const html = generateDocumentHtml(file.name, studentName, assignmentTitle);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    }
  };

  const downloadFile = () => {
    if (Platform.OS === 'web') {
      const link = document.createElement('a');
      link.href = file.uri || `data:text/html;charset=utf-8,${encodeURIComponent(generateDocumentHtml(file.name, studentName, assignmentTitle))}`;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (file.uri) {
      Linking.openURL(file.uri).catch(() => {});
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.modal, { backgroundColor: c.surface, borderColor: c.border }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <View style={[styles.fileIcon, { backgroundColor: isPdf ? c.dangerBg : c.primarySoft }]}>
              <Ionicons
                name={isPdf ? 'document-text' : isImage ? 'image' : 'document-attach'}
                size={22}
                color={isPdf ? c.danger : c.primary}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{file.name}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {file.sizeMb !== undefined && <Txt variant="caption" color={c.muted}>{file.sizeMb} MB</Txt>}
                {studentName && <Txt variant="caption" color={c.muted}>· By {studentName}</Txt>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Button
                title={Platform.OS === 'web' ? 'Open in new tab' : 'Open'}
                variant="outline"
                size="md"
                iconLeft="open-outline"
                onPress={openExternal}
              />
              <IconButton icon="download-outline" label="Download" onPress={downloadFile} />
              <IconButton icon="close" label="Close preview" onPress={onClose} />
            </View>
          </View>

          {/* Document Content View */}
          <View style={styles.body}>
            {Platform.OS === 'web' ? (
              file.uri ? (
                <iframe
                  src={file.uri}
                  title={file.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 540,
                    border: 'none',
                    borderRadius: 8,
                    backgroundColor: '#525659',
                  }}
                />
              ) : (
                <iframe
                  srcDoc={generateDocumentHtml(file.name, studentName, assignmentTitle)}
                  title={file.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 540,
                    border: 'none',
                    borderRadius: 8,
                    backgroundColor: '#fff',
                  }}
                />
              )
            ) : (
              <View style={[styles.nativeDoc, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
                <Ionicons name="document-text" size={64} color={c.primary} />
                <Txt variant="heading">{file.name}</Txt>
                <Txt variant="body" color={c.muted} center>
                  {assignmentTitle ? `Submission for "${assignmentTitle}"` : 'Assignment submission document'}
                </Txt>
                <Button
                  title="Open in Document Viewer"
                  iconLeft="open-outline"
                  onPress={openExternal}
                  style={{ marginTop: 12 }}
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function generateDocumentHtml(fileName: string, studentName?: string, assignmentTitle?: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${fileName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px;
      color: #1a202c;
      background: #f7fafc;
      display: flex;
      justify-content: center;
    }
    .page {
      background: #ffffff;
      width: 100%;
      max-width: 800px;
      min-height: 900px;
      padding: 50px 60px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.08);
      border-radius: 8px;
      box-sizing: border-box;
    }
    .header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background: #ebf8ff;
      color: #2b6cb0;
      font-size: 12px;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 8px 0;
      color: #1a365d;
    }
    .meta {
      font-size: 14px;
      color: #718096;
      line-height: 1.5;
    }
    .section-title {
      font-size: 18px;
      font-weight: 700;
      color: #2d3748;
      margin: 28px 0 12px 0;
      border-bottom: 1px solid #edf2f7;
      padding-bottom: 6px;
    }
    p, li {
      font-size: 15px;
      line-height: 1.7;
      color: #4a5568;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 10px 12px;
      text-align: left;
      font-size: 14px;
    }
    th {
      background: #edf2f7;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="badge">Submitted Assignment Document</div>
        <h1>${assignmentTitle || 'Assignment Submission'}</h1>
        <div class="meta"><strong>File:</strong> ${fileName}</div>
        <div class="meta"><strong>Student:</strong> ${studentName || 'Student'}</div>
        <div class="meta"><strong>Status:</strong> Submitted for review</div>
      </div>
    </div>

    <div class="section-title">1. Executive Summary & Objective</div>
    <p>This document details the completed project requirements according to the assignment brief. The strategic plan encompasses comprehensive audience research, target KPI definitions, and structured deliverables prepared for client review.</p>

    <div class="section-title">2. Research & Strategy Table</div>
    <table>
      <thead>
        <tr>
          <th>Module / Pillar</th>
          <th>Strategic Goal</th>
          <th>Target Outcome</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Pillar 1: Audience Insight</td>
          <td>Identify high-intent buyer personas</td>
          <td>Segmented demographic profiles</td>
          <td>Completed</td>
        </tr>
        <tr>
          <td>Pillar 2: Deliverables</td>
          <td>Draft campaign schedule & creative briefs</td>
          <td>Multi-channel calendar schedule</td>
          <td>Completed</td>
        </tr>
        <tr>
          <td>Pillar 3: Performance Metrics</td>
          <td>Establish ROI, CPA and conversion targets</td>
          <td>Dashboard metrics defined</td>
          <td>Validated</td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">3. Analysis & Deliverable Breakdown</div>
    <p>All core criteria established in the rubric have been incorporated. Performance benchmarking and tactical implementation guidelines follow the course syllabus recommendations and best practices.</p>
  </div>
</body>
</html>`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  modal: {
    width: '100%',
    maxWidth: 960,
    maxHeight: '92%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minHeight: 540,
    maxHeight: '80vh' as any,
    backgroundColor: '#333',
  },
  nativeDoc: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
});
