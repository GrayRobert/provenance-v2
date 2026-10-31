'use client';

import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
} from '@react-pdf/renderer';
import type { CertificatePdfPayload } from '@/lib/certificatePdf';
import { formatTsTimestamp } from '@/lib/format';

// Theme – matches app/globals.css light certificate
const colors = {
  accent: '#f6992c',
  muted: '#4a4a4e',
  foreground: '#1a1a1a',
  border: '#e5e2dd',
  surface: '#f8f6f2',
  verified: '#22c55e',
  destructive: '#ef4444',
};

const HASH_PALETTE = [
  [246, 153, 44],
  [51, 127, 204],
  [140, 89, 182],
  [204, 85, 17],
  [230, 184, 0],
] as const;

function hashGridCellColor(char: string, index: number): string {
  const value = parseInt(char, 16);
  const opacity = 0.2 + (value / 15) * 0.8;
  const [r, g, b] = HASH_PALETTE[index % HASH_PALETTE.length];
  const rBlend = Math.round(r * opacity + 255 * (1 - opacity));
  const gBlend = Math.round(g * opacity + 255 * (1 - opacity));
  const bBlend = Math.round(b * opacity + 255 * (1 - opacity));
  return `rgb(${rBlend}, ${gBlend}, ${bBlend})`;
}

const PAGE_BG = '#ebe8e4';

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.foreground,
    backgroundColor: PAGE_BG,
  },
  pageInner: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logoWrap: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoWrapImage: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoImg: {
    width: 24,
    height: 24,
    objectFit: 'contain',
  },
  logoFallback: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Helvetica',
  },
  accentBar: {
    width: 6,
    height: 20,
    backgroundColor: colors.accent,
    marginRight: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  headerTitles: {
    flexDirection: 'column',
    minWidth: 0,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  certId: {
    fontSize: 8,
    color: colors.muted,
    fontFamily: 'Helvetica',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    flexShrink: 0,
  },
  hashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 55,
    gap: 1.2,
  },
  hashCell: {
    width: 7.5,
    height: 7.5,
  },
  chainBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  chainLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  chainStatus: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.muted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  box: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    padding: 10,
    marginBottom: 8,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    width: '30%',
    minWidth: 80,
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 9,
    color: colors.foreground,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  splitName: {
    fontSize: 9,
    color: colors.foreground,
    marginRight: 6,
  },
  splitRole: {
    fontSize: 8,
    color: colors.muted,
  },
  bodyText: {
    fontSize: 9,
    color: colors.foreground,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  link: {
    color: colors.accent,
    textDecoration: 'underline',
  },
  qrImage: {
    width: 80,
    height: 80,
    marginTop: 8,
    marginBottom: 6,
  },
  cryptoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  cryptoBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
  },
  cryptoGridWrap: {
    width: 55,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1.2,
    flexShrink: 0,
  },
  cryptoGridCell: {
    width: 7.5,
    height: 7.5,
  },
  cryptoText: {
    flex: 1,
    minWidth: 0,
  },
  cryptoHashLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  cryptoHash: {
    fontSize: 6,
    color: colors.foreground,
    fontFamily: 'Courier',
    lineHeight: 1.2,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    marginBottom: 8,
    paddingTop: 8,
  },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  coveragePercent: {
    color: colors.accent,
    fontWeight: 'bold',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 4,
  },
  sessionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    padding: 8,
    marginBottom: 6,
  },
  sessionTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 2,
  },
  sessionMeta: {
    fontSize: 7,
    color: colors.muted,
    marginBottom: 2,
  },
  sessionEvents: {
    fontSize: 7,
    color: colors.muted,
  },
  songBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    padding: 10,
    marginBottom: 8,
  },
  songText: {
    fontSize: 7,
    fontFamily: 'Courier',
    color: colors.foreground,
    lineHeight: 1.35,
  },
  artifactCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
    padding: 6,
    marginBottom: 4,
  },
  artifactKind: {
    fontSize: 7,
    fontWeight: 'bold',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  artifactLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 2,
  },
  artifactMeta: {
    fontSize: 7,
    color: colors.muted,
    marginBottom: 1,
  },
  artifactHash: {
    fontSize: 6,
    fontFamily: 'Courier',
    color: colors.muted,
    marginTop: 2,
    lineHeight: 1.2,
  },
});

function HashGrid({ hash, size = 6 }: { hash: string; size?: number }) {
  const cleanHash = hash.replace(/^0x/, '');
  const cells = cleanHash.slice(0, size * size).split('');
  return (
    <View style={styles.hashGrid}>
      {cells.map((char, i) => (
        <View
          key={i}
          style={[styles.hashCell, { backgroundColor: hashGridCellColor(char, i) }]}
        />
      ))}
    </View>
  );
}

function HashGridCrypto({ hash }: { hash: string }) {
  const cleanHash = hash.replace(/^0x/, '');
  const cells = cleanHash.slice(0, 36).split('');
  return (
    <View style={styles.cryptoGridWrap}>
      {cells.map((char, i) => (
        <View
          key={i}
          style={[styles.cryptoGridCell, { backgroundColor: hashGridCellColor(char, i) }]}
        />
      ))}
    </View>
  );
}

/** Split a long string (e.g. hash) into lines of maxChars so it wraps in the PDF instead of overflowing. */
function splitHashLines(hash: string, maxCharsPerLine: number = 32): string[] {
  const clean = hash.replace(/^0x/, '');
  const lines: string[] = [];
  for (let i = 0; i < clean.length; i += maxCharsPerLine) {
    lines.push(clean.slice(i, i + maxCharsPerLine));
  }
  return lines.length ? lines : [hash];
}

function formatSessionDuration(minutes: number): string {
  if (minutes === 0) return 'Less than a minute';
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min`;
}

function formatSessionTimeRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const dateStr = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const endStr = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${startStr}–${endStr}`;
}

export function CertificatePdfDocument({ payload }: { payload: CertificatePdfPayload }) {
  const chainStatus =
    payload.chainVerified === null
      ? '—'
      : payload.chainVerified
        ? 'Verified'
        : 'Violation';

  return (
    <Document
      title={`Song History – ${payload.songTitle}`}
      author="Provenance"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.pageInner}>
        {/* Header: logo or accent bar + title + hash grid + chain integrity */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {payload.logoUrl ? (
              <View style={styles.logoWrapImage}>
                <Image src={payload.logoUrl} style={styles.logoImg} />
              </View>
            ) : (
              <View style={styles.logoWrap}>
                <Text style={styles.logoFallback}>♪</Text>
              </View>
            )}
            <View style={styles.headerTitles}>
              <Text style={styles.sectionLabel}>Song History</Text>
              <Text style={styles.certId}>{payload.certificateId}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <HashGrid hash={payload.rootHash} size={6} />
            <View style={styles.chainBlock}>
              <Text style={styles.chainLabel}>Chain Integrity</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {payload.chainVerified === true && (
                  <>
                    <View style={[styles.dot, { backgroundColor: colors.verified }]} />
                    <Text style={[styles.chainStatus, { color: colors.verified }]}>{chainStatus}</Text>
                  </>
                )}
                {payload.chainVerified === false && (
                  <>
                    <View style={[styles.dot, { backgroundColor: colors.destructive }]} />
                    <Text style={[styles.chainStatus, { color: colors.destructive }]}>{chainStatus}</Text>
                  </>
                )}
                {payload.chainVerified === null && (
                  <Text style={[styles.chainStatus, { color: colors.muted }]}>{chainStatus}</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.title}>{payload.songTitle || 'Untitled Song'}</Text>

        {/* Work Metadata */}
        <Text style={styles.sectionTitle}>Work Metadata</Text>
        <View style={styles.box}>
          <View style={styles.metaGrid}>
            {(payload.workMetadata.items ?? []).map((item, i) => (
              <View key={`${item.name}-${i}`} style={styles.metaItem}>
                <Text style={styles.metaLabel}>{item.name}</Text>
                <Text style={styles.metaValue}>{item.value ?? '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Author details supplied by the songwriter (snapshot at export time) */}
        {payload.authorSnapshot ? (
          <>
            <Text style={styles.sectionTitle}>Author details supplied by the songwriter</Text>
            <View style={styles.box}>
              <Text style={[styles.bodyText, { marginBottom: 4, color: colors.muted }]}>
                Self-supplied by the songwriter; not independently verified. Snapshot taken at export: {payload.authorSnapshot.snapshotAt}
              </Text>
              {payload.authorSnapshot.songwriterName ? (
                <Text style={[styles.bodyText, { marginBottom: 2 }]}>Songwriter: {payload.authorSnapshot.songwriterName}</Text>
              ) : null}
              {payload.authorSnapshot.legalName ? (
                <Text style={[styles.bodyText, { marginBottom: 2 }]}>Legal name: {payload.authorSnapshot.legalName}</Text>
              ) : null}
              {payload.authorSnapshot.contactOrWebsite ? (
                <Text style={[styles.bodyText, { marginBottom: 2 }]}>Contact: {payload.authorSnapshot.contactOrWebsite}</Text>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Ownership Splits */}
        <Text style={styles.sectionTitle}>Ownership Splits</Text>
        <View style={styles.box}>
          {payload.splits.map((split, i) => (
            <View key={i} style={styles.splitRow}>
              <Text style={styles.splitName}>{split.name} — {split.share}%</Text>
              <Text style={styles.splitRole}>{split.role}</Text>
            </View>
          ))}
        </View>

        {/* Evidence summary */}
        <Text style={styles.sectionTitle}>Evidence summary</Text>
        <View style={styles.box}>
          <Text style={[styles.bodyText, { marginBottom: 4, fontWeight: 'bold' }]}>
            Evidence covered:
          </Text>
          <Text style={[styles.bodyText, { marginBottom: 6 }]}>
            {payload.evidenceSummary.covered.length > 0
              ? payload.evidenceSummary.covered.join(', ')
              : 'None'}
          </Text>
          {payload.evidenceSummary.questionable.length > 0 && (
            <>
              <Text style={[styles.bodyText, { marginBottom: 4, fontWeight: 'bold', color: colors.accent }]}>
                Questionable:
              </Text>
              {payload.evidenceSummary.questionable.map((line, i) => (
                <Text key={i} style={[styles.bodyText, { marginBottom: 2 }]}>
                  {line}
                </Text>
              ))}
            </>
          )}
        </View>

        {/* Supporting Evidence (artifacts) */}
        {payload.artifacts && payload.artifacts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Supporting Evidence</Text>
            <Text style={[styles.bodyText, { marginBottom: 6, color: colors.muted, fontSize: 8 }]}>
              Artifacts: demo recordings, lyrics scans, videos, notes. Each file is SHA-256 hashed at upload.
            </Text>
            {payload.artifacts.map((artifact) => {
              const kindLabel =
                artifact.kind === 'demo_recording'
                  ? 'Demo Recording'
                  : artifact.kind === 'stem'
                    ? 'Audio Stem'
                    : artifact.kind === 'handwritten_lyrics'
                      ? 'Handwritten Lyrics'
                      : artifact.kind === 'lyrics_import'
                        ? 'Imported lyrics file'
                        : artifact.kind === 'video'
                          ? 'Video'
                          : artifact.kind === 'note'
                            ? 'Note'
                            : artifact.kind;
              const dateStr = (() => {
                try {
                  const d = new Date(artifact.uploadedAt);
                  return d.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                } catch {
                  return artifact.uploadedAt;
                }
              })();
              return (
                <View key={artifact.id} style={styles.artifactCard}>
                  <Text style={styles.artifactKind}>{kindLabel}</Text>
                  <Text style={styles.artifactLabel}>{artifact.label}</Text>
                  <Text style={styles.artifactMeta}>
                    {artifact.filename} — {artifact.mimeType}
                  </Text>
                  <Text style={styles.artifactMeta}>{dateStr}</Text>
                  {artifact.hash && (
                    <Text style={styles.artifactHash}>
                      SHA-256: {artifact.hash}
                    </Text>
                  )}
                </View>
              );
            })}
          </>
        )}

        {/* Writing Sessions */}
        {payload.writingSessions && payload.writingSessions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Writing Sessions</Text>
            <Text style={[styles.bodyText, { marginBottom: 6, color: colors.muted, fontSize: 8 }]}>
              Your creative process grouped by activity. Sessions separated by more than 30 minutes are shown separately.
            </Text>
            {payload.writingSessions.map((session, i) => (
              <View key={i} style={styles.sessionCard}>
                <Text style={styles.sessionTitle}>
                  Writing Session · {formatSessionDuration(session.durationMinutes)}
                </Text>
                <Text style={styles.sessionMeta}>
                  {formatSessionTimeRange(session.startTime, session.endTime)}
                </Text>
                <Text style={styles.sessionMeta}>{session.summaryText}</Text>
                <Text style={styles.sessionEvents}>
                  {session.eventCount} event{session.eventCount !== 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Song (lyrics & chords from HTML export) */}
        {payload.songAsText && (
          <>
            <Text style={styles.sectionTitle}>Song</Text>
            <View style={styles.songBox}>
              {payload.songAsText.split('\n').map((line, i) => (
                <Text key={i} style={styles.songText}>{line || ' '}</Text>
              ))}
            </View>
          </>
        )}

        {/* Verification + QR */}
        <Text style={styles.sectionTitle}>Verification</Text>
        <View style={styles.box}>
          <Text style={styles.bodyText}>
            The hash chain in this document was verified on the device that exported it,
            against the history stored in that browser. This detects changes to the stored
            history; it does not prove when events originally happened and is not
            independently witnessed.
          </Text>
          <Text style={styles.bodyText}>Validation ID: {payload.certificateId}</Text>
        </View>

        {/* Cryptographic Summary */}
        <Text style={styles.sectionTitle}>Cryptographic Summary</Text>
        <View style={styles.box}>
          <View style={styles.cryptoRow}>
            <View style={styles.cryptoBlock}>
              <HashGridCrypto hash={payload.rootHash} />
              <View style={styles.cryptoText}>
                <Text style={styles.cryptoHashLabel}>Genesis Block Hash</Text>
                {splitHashLines(payload.rootHash, 32).map((line, i) => (
                  <Text key={i} style={styles.cryptoHash}>{line}</Text>
                ))}
              </View>
            </View>
            <View style={styles.cryptoBlock}>
              <HashGridCrypto hash={payload.latestHash} />
              <View style={styles.cryptoText}>
                <Text style={styles.cryptoHashLabel}>Latest Block Hash</Text>
                {splitHashLines(payload.latestHash, 32).map((line, i) => (
                  <Text key={i} style={styles.cryptoHash}>{line}</Text>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.divider}>
            <Text style={[styles.bodyText, { color: colors.muted, fontSize: 8 }]}>
              Chain depth: {payload.eventCount} blocks.
            </Text>
            <Text style={[styles.bodyText, { color: colors.muted, fontSize: 8 }]}>
              Each event references the SHA-256 hash of its predecessor, forming a tamper-evident
              chain over the history stored in this browser. Modifying the stored history
              invalidates all subsequent hashes, which this verification detects. Verification
              happens on this device only: it is not a trusted timestamp and not independent
              proof of authorship.
            </Text>
          </View>
        </View>

        {(payload.tsaProvider ?? payload.tsaVerificationStatus) && (
          <>
            <Text style={styles.sectionTitle}>External Timestamp</Text>
            <View style={styles.box}>
              {payload.tsaProvider && (
                <View style={styles.coverageRow}>
                  <Text style={[styles.bodyText, { color: colors.muted, fontSize: 8 }]}>
                    TSA Provider:{' '}
                  </Text>
                  <Text style={styles.bodyText}>{payload.tsaProvider}</Text>
                </View>
              )}
              <View style={styles.coverageRow}>
                <Text style={[styles.bodyText, { color: colors.muted, fontSize: 8 }]}>
                  Timestamp (UTC):{' '}
                </Text>
                <Text style={styles.bodyText}>
                  {payload.tsaGenTime
                    ? formatTsTimestamp(payload.tsaGenTime)
                    : '—'}
                </Text>
              </View>
              {payload.snapshotHash && (
                <View style={styles.coverageRow}>
                  <Text style={[styles.bodyText, { color: colors.muted, fontSize: 8 }]}>
                    Snapshot hash:{' '}
                  </Text>
                  <Text style={[styles.bodyText, { fontSize: 7 }]}>
                    {payload.snapshotHash}
                  </Text>
                </View>
              )}
              {payload.tsaVerificationStatus && (
                <View style={styles.coverageRow}>
                  <Text style={[styles.bodyText, { color: colors.muted, fontSize: 8 }]}>
                    Status:{' '}
                  </Text>
                  <Text style={styles.bodyText}>{payload.tsaVerificationStatus}</Text>
                </View>
              )}
              {payload.tsaVerificationError && (
                <Text style={[styles.bodyText, { color: colors.destructive, fontSize: 8 }]}>
                  {payload.tsaVerificationError}
                </Text>
              )}
            </View>
          </>
        )}
        </View>
      </Page>
    </Document>
  );
}
