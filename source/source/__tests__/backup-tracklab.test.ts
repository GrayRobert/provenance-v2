import { Blob as NodeBlob } from 'node:buffer';
// jsdom's Blob is a different class from Node's structured-cloneable Blob, so audio
// blobs would come back out of fake-indexeddb as plain objects. Browsers store Blob
// in IndexedDB natively; this shim only aligns the test environment.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { songApi } from '@/lib/api';
import { buildBackup, restoreBackup } from '@/lib/localDb';
import { listAllStoredRecordings } from '@/lib/localRecordings';

function resetStores() {
  window.localStorage.clear();
  indexedDB = new IDBFactory();
}

function wavBlob(marker: string): Blob {
  return new Blob([`fake-audio-${marker}`], { type: 'audio/wav' });
}

beforeEach(resetStores);

describe('backup roundtrip', () => {
  it('preserves a custom recording name exactly (no version suffix)', async () => {
    const { songId } = await songApi.createSong();
    await songApi.uploadRecording(songId, wavBlob('take'), {
      label: 'Verse rough take',
      labelIsCustom: true,
      durationSeconds: 12,
    });

    const backup = await buildBackup();
    const json = JSON.stringify(backup);

    resetStores();
    await restoreBackup(json);

    const songs = await songApi.getSongs();
    expect(songs).toHaveLength(1);
    const recordings = await songApi.getRecordings(songs[0].songId);
    expect(recordings).toHaveLength(1);
    expect(recordings[0].label).toBe('Verse rough take');
    expect(recordings[0].customLabel).toBe(true);
    expect(recordings[0].durationSeconds).toBe(12);
    const stored = await listAllStoredRecordings();
    expect(stored).toHaveLength(1);
    expect(await stored[0].blob!.text()).toBe('fake-audio-take');
  });

  it('preserves Track Lab projects with their track recordings', async () => {
    const { songId } = await songApi.createSong();
    const projectData = JSON.stringify({ tempo: 120, timeSignature: '4/4' });
    const { projectId } = await songApi.saveTrackLabProject(songId, 'Demo Project', projectData, [
      { trackIndex: 0, label: 'Guitar', durationSeconds: 8, blob: wavBlob('guitar') },
      { trackIndex: 1, label: 'Vocal', durationSeconds: 9, blob: wavBlob('vocal') },
    ]);

    const backup = await buildBackup();
    const json = JSON.stringify(backup);

    resetStores();
    await restoreBackup(json);

    const songs = await songApi.getSongs();
    const projects = await songApi.getTrackLabProjects(songs[0].songId);
    expect(projects).toHaveLength(1);
    expect(projects[0].projectId).toBe(projectId);
    expect(projects[0].name).toBe('Demo Project');
    expect(projects[0].projectData).toBe(projectData);
    expect(projects[0].archivedAt).toBeNull();
    expect(projects[0].recordings.map((r) => r.trackIndex)).toEqual([0, 1]);
    expect(projects[0].recordings.map((r) => r.label)).toEqual(['Guitar', 'Vocal']);
  });

  it('re-saving a project archives the previous take on the same track', async () => {
    const { songId } = await songApi.createSong();
    const { projectId } = await songApi.saveTrackLabProject(songId, 'Demo', '{}', [
      { trackIndex: 0, label: 'Take 1', durationSeconds: 5, blob: wavBlob('take1') },
      { trackIndex: 1, label: 'Keep', durationSeconds: 5, blob: wavBlob('keep') },
    ]);

    await songApi.saveTrackLabProject(songId, 'Demo', '{}', [
      { trackIndex: 0, label: 'Take 2', durationSeconds: 6, blob: wavBlob('take2') },
    ], projectId);

    const [project] = await songApi.getTrackLabProjects(songId);
    expect(project.recordings.map((r) => r.label)).toEqual(['Take 2', 'Keep']);

    const all = await songApi.getRecordings(songId);
    const archived = all.filter((r) => r.archivedAt);
    expect(archived).toHaveLength(1);
    expect(archived[0].label).toBe('Take 1');
  });

  it('rejects blank project names on rename', async () => {
    const { songId } = await songApi.createSong();
    const { projectId } = await songApi.saveTrackLabProject(songId, 'Demo', '{}', [
      { trackIndex: 0, label: null, durationSeconds: 5, blob: wavBlob('x') },
    ]);
    await expect(songApi.updateTrackLabProjectName(songId, projectId, '   ')).rejects.toThrow();
    await songApi.updateTrackLabProjectName(songId, projectId, 'Renamed');
    const [project] = await songApi.getTrackLabProjects(songId);
    expect(project.name).toBe('Renamed');
  });
});
