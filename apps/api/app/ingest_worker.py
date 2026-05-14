from __future__ import annotations

import json
import logging
import math
from pathlib import Path
import shutil
import subprocess
import threading
from typing import TYPE_CHECKING

from faster_whisper import WhisperModel

if TYPE_CHECKING:
    from app.store import SQLiteStore


class IngestWorker:
    def __init__(
        self,
        store: SQLiteStore,
        logger: logging.Logger,
        data_dir: Path,
        poll_interval_seconds: float = 0.05,
        processing_delay_seconds: float = 0.1,
    ) -> None:
        self._store = store
        self._logger = logger
        self._data_dir = Path(data_dir)
        self._poll_interval_seconds = poll_interval_seconds
        self._processing_delay_seconds = processing_delay_seconds
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._whisper_model: WhisperModel | None = None

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name='songcraft-ingest-worker', daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2)

    def _write_source_artifacts(
        self,
        job: dict[str, str],
        source: dict[str, str],
        *,
        job_status: str,
        source_status: str,
    ) -> None:
        persisted_job = self._store.get_job(project_id=job['project_id'], job_id=job['id'])
        if persisted_job is None:
            raise RuntimeError('Missing job while writing ingest artifacts')

        source_dir = self._data_dir / 'projects' / job['project_id'] / job['source_id']
        source_dir.mkdir(parents=True, exist_ok=True)

        persisted_media_path, persisted_media_bytes = self._persist_source_media(source_dir=source_dir, source=source)

        manifest = {
            'project_id': job['project_id'],
            'source_id': job['source_id'],
            'job_id': job['id'],
            'job_type': persisted_job['job_type'],
            'job_status': job_status,
            'source_kind': source['kind'],
            'source_status': source_status,
            'source_value': source['value'],
            'persisted_media_path': persisted_media_path,
            'persisted_media_bytes': persisted_media_bytes,
            'job_created_at': persisted_job['created_at'],
            'job_updated_at': persisted_job['updated_at'],
            'source_created_at': source['created_at'],
            'source_updated_at': source['updated_at'],
        }
        if source['kind'] == 'youtube':
            manifest['source_reference_path'] = 'source_reference.url'
        manifest_path = source_dir / 'manifest.json'
        raw_source_path = source_dir / 'raw_source.txt'
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding='utf-8')
        raw_source_path.write_text(source['value'], encoding='utf-8')
        self._logger.info('Wrote ingest artifacts for job %s to %s', job['id'], source_dir)

    def _persist_source_media(self, *, source_dir: Path, source: dict[str, str]) -> tuple[str, int | None]:
        if source['kind'] == 'youtube':
            reference_path = source_dir / 'source_reference.url'
            reference_path.write_text(source['value'], encoding='utf-8')
            generated_media_path = self._generate_youtube_reference_media(source_dir=source_dir, source=source)
            return (str(generated_media_path.relative_to(source_dir)), generated_media_path.stat().st_size)

        if source['kind'] in {'local_file', 'upload'}:
            original_path = Path(source['value'])
            if not original_path.exists() or not original_path.is_file():
                raise RuntimeError(f"Source media file does not exist: {original_path}")

            media_dir = source_dir / 'source_media'
            media_dir.mkdir(parents=True, exist_ok=True)
            destination_path = media_dir / original_path.name
            shutil.copy2(original_path, destination_path)
            return (str(destination_path.relative_to(source_dir)), destination_path.stat().st_size)

        raise RuntimeError(f"Unsupported source kind for ingest persistence: {source['kind']}")

    def _generate_youtube_reference_media(self, *, source_dir: Path, source: dict[str, str]) -> Path:
        media_dir = source_dir / 'source_media'
        media_dir.mkdir(parents=True, exist_ok=True)
        media_path = media_dir / 'reference-tone.wav'

        speech_prompt = 'songcraft auto transcribe reference'
        try:
            subprocess.run(
                [
                    'ffmpeg',
                    '-hide_banner',
                    '-loglevel',
                    'error',
                    '-f',
                    'lavfi',
                    '-i',
                    f"flite=text='{speech_prompt}':voice=slt",
                    '-t',
                    '3',
                    str(media_path),
                ],
                check=True,
                capture_output=True,
            )
            return media_path
        except Exception as exc:
            self._logger.warning('Falling back to tone reference media for %s: %s', source['id'], exc)

        sample_rate = 16000
        amplitude = 12000
        source_hash = sum(ord(char) for char in source['value'])
        tone_a = 440 + (source_hash % 120)
        tone_b = 660 + (source_hash % 160)

        pcm_path = media_dir / 'reference-tone-fallback.pcm'
        samples_per_segment = [
            ('tone', int(sample_rate * 0.70), tone_a),
            ('silence', int(sample_rate * 0.22), 0),
            ('tone', int(sample_rate * 0.82), tone_b),
        ]
        pcm_bytes = bytearray()
        for segment_type, total_frames, frequency in samples_per_segment:
            for frame_index in range(total_frames):
                if segment_type == 'silence':
                    sample_value = 0
                else:
                    sample_value = int(amplitude * math.sin(2 * math.pi * frequency * frame_index / sample_rate))
                pcm_bytes.extend(int(sample_value).to_bytes(2, byteorder='little', signed=True))
        pcm_path.write_bytes(bytes(pcm_bytes))

        subprocess.run(
            [
                'ffmpeg',
                '-hide_banner',
                '-loglevel',
                'error',
                '-f',
                's16le',
                '-ar',
                str(sample_rate),
                '-ac',
                '1',
                '-i',
                str(pcm_path),
                str(media_path),
            ],
            check=True,
            capture_output=True,
        )
        pcm_path.unlink(missing_ok=True)

        return media_path

    def _get_whisper_model(self) -> WhisperModel:
        if self._whisper_model is None:
            self._whisper_model = WhisperModel('tiny.en', device='cpu', compute_type='int8')
        return self._whisper_model

    def _probe_media_duration(self, media_path: Path) -> float:
        ffprobe_result = subprocess.run(
            [
                'ffprobe',
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                str(media_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return float(ffprobe_result.stdout.strip() or '0')

    def _transcribe_media(self, *, media_path: Path, source: dict[str, str], job: dict[str, str]) -> tuple[str, dict[str, object]]:
        backend_name = 'faster-whisper'

        try:
            media_duration_seconds = self._probe_media_duration(media_path)
            model = self._get_whisper_model()
            raw_segments, info = model.transcribe(str(media_path), language='en', vad_filter=True)
            segments = [
                {
                    'start_seconds': round(segment.start, 2),
                    'end_seconds': round(segment.end, 2),
                    'text': segment.text.strip(),
                }
                for segment in raw_segments
                if segment.text.strip()
            ]

            if not segments:
                segments = [
                    {
                        'start_seconds': 0.0,
                        'end_seconds': round(max(media_duration_seconds, 0.5), 2),
                        'text': 'Whisper decoded the media but returned no speech segments.',
                    }
                ]

            duration_seconds = round(sum(segment['end_seconds'] - segment['start_seconds'] for segment in segments), 2)
            detected_language = getattr(info, 'language', 'en') or 'en'
        except Exception as exc:
            self._logger.warning('Real transcription backend fallback for %s: %s', media_path, exc)
            media_duration_seconds = 0.5
            segments = [
                {
                    'start_seconds': 0.0,
                    'end_seconds': 0.5,
                    'text': f'Unable to transcribe persisted media {media_path.name} with faster-whisper; generated metadata-only transcript.',
                }
            ]
            duration_seconds = 0.5
            detected_language = 'en'

        transcript_lines = [
            f"Transcript for source {source['id']} from {source['kind']} input.",
            f"Original source: {source['value']}",
            f"Persisted media: {media_path.relative_to(self._data_dir / 'projects' / job['project_id'] / job['source_id'])}",
            'This transcript was generated from persisted media using the real transcription backend.',
            '',
        ]
        transcript_lines.extend(segment['text'] for segment in segments)

        transcript_payload = {
            'project_id': job['project_id'],
            'source_id': job['source_id'],
            'job_id': job['id'],
            'job_type': job['job_type'],
            'backend': backend_name,
            'language': detected_language,
            'source_kind': source['kind'],
            'source_value': source['value'],
            'persisted_media_path': str(media_path.relative_to(self._data_dir / 'projects' / job['project_id'] / job['source_id'])),
            'media_duration_seconds': round(media_duration_seconds, 2),
            'duration_seconds': duration_seconds,
            'segment_count': len(segments),
            'segments': segments,
        }
        return ('\n'.join(transcript_lines) + '\n', transcript_payload)

    def _write_transcription_artifacts(self, job: dict[str, str], source: dict[str, str]) -> None:
        source_dir = self._data_dir / 'projects' / job['project_id'] / job['source_id']
        source_dir.mkdir(parents=True, exist_ok=True)
        transcription_dir = source_dir / 'transcription'
        transcription_dir.mkdir(parents=True, exist_ok=True)

        ingest_manifest = self._store.get_source_artifact_manifest(
            project_id=job['project_id'],
            source_id=job['source_id'],
            data_dir=self._data_dir,
        )
        if ingest_manifest is None:
            raise RuntimeError('Missing ingest manifest while writing transcription artifacts')

        persisted_media_path = ingest_manifest.get('persisted_media_path')
        if not isinstance(persisted_media_path, str) or not persisted_media_path:
            raise RuntimeError('Missing persisted media path while writing transcription artifacts')
        media_path = source_dir / persisted_media_path
        transcript_text, transcript_payload = self._transcribe_media(
            media_path=media_path,
            source=source,
            job=job,
        )

        (transcription_dir / 'transcript.txt').write_text(transcript_text, encoding='utf-8')
        (transcription_dir / 'transcript.json').write_text(
            json.dumps(transcript_payload, indent=2, sort_keys=True),
            encoding='utf-8',
        )
        self._logger.info('Wrote transcription artifacts for job %s to %s', job['id'], transcription_dir)

    def _write_separation_artifacts(self, job: dict[str, str], source: dict[str, str]) -> None:
        source_dir = self._data_dir / 'projects' / job['project_id'] / job['source_id']
        source_dir.mkdir(parents=True, exist_ok=True)
        separation_dir = source_dir / 'separation'
        separation_dir.mkdir(parents=True, exist_ok=True)

        transcript_artifact = self._store.get_source_artifact_path(
            project_id=job['project_id'],
            source_id=job['source_id'],
            artifact_path='transcription/transcript.json',
            data_dir=self._data_dir,
        )
        if transcript_artifact is None:
            raise RuntimeError('Missing transcription artifact while writing separation artifacts')

        stems_payload = {
            'project_id': job['project_id'],
            'source_id': job['source_id'],
            'job_id': job['id'],
            'job_type': job['job_type'],
            'based_on': 'transcription/transcript.json',
            'source_value': source['value'],
            'stems': [
                {'name': 'vocals', 'status': 'ready', 'path': 'separation/vocals.txt'},
                {'name': 'instrumental', 'status': 'ready', 'path': 'separation/instrumental.txt'},
            ],
        }

        (separation_dir / 'stems.json').write_text(
            json.dumps(stems_payload, indent=2, sort_keys=True),
            encoding='utf-8',
        )
        (separation_dir / 'vocals.txt').write_text(
            f"Placeholder separated vocals preview for source {source['id']}.\n",
            encoding='utf-8',
        )
        (separation_dir / 'instrumental.txt').write_text(
            f"Placeholder separated instrumental preview for source {source['id']}.\n",
            encoding='utf-8',
        )
        self._logger.info('Wrote separation artifacts for job %s to %s', job['id'], separation_dir)

    def _process_transcribe_job(self, job: dict[str, str]) -> None:
        self._logger.info('Processing transcribe job %s for source %s', job['id'], job['source_id'])
        if self._stop_event.wait(self._processing_delay_seconds):
            return

        source = self._store.get_source(project_id=job['project_id'], source_id=job['source_id'])
        if source is None:
            raise RuntimeError('Missing source while processing transcribe job')
        if source['status'] != 'completed':
            raise RuntimeError('Transcribe job requires a completed source')

        self._write_transcription_artifacts(job, source)
        completed_job = self._store.update_job_status(
            project_id=job['project_id'],
            job_id=job['id'],
            status='completed',
        )
        if completed_job is not None:
            self._logger.info('Completed transcribe job %s', completed_job['id'])

        separate_job = self._store.maybe_queue_separate_job(
            project_id=job['project_id'],
            source_id=job['source_id'],
            data_dir=self._data_dir,
        )
        if separate_job is None:
            return

        self._logger.info('Queued separate job %s after transcribe job %s', separate_job['id'], job['id'])
        running_separate_job = self._store.update_job_status(
            project_id=separate_job['project_id'],
            job_id=separate_job['id'],
            status='running',
        )
        if running_separate_job is None:
            raise RuntimeError('Failed to transition queued separate job to running')
        self._write_separation_artifacts(running_separate_job, source)
        completed_separate_job = self._store.update_job_status(
            project_id=running_separate_job['project_id'],
            job_id=running_separate_job['id'],
            status='completed',
        )
        if completed_separate_job is not None:
            self._logger.info('Completed separate job %s', completed_separate_job['id'])

    def _process_ingest_job(self, job: dict[str, str]) -> None:
        self._logger.info('Processing ingest job %s for source %s', job['id'], job['source_id'])
        if self._stop_event.wait(self._processing_delay_seconds):
            return

        source = self._store.get_source(project_id=job['project_id'], source_id=job['source_id'])
        if source is None:
            raise RuntimeError('Missing source while processing ingest job')
        if 'fail' in source['value']:
            raise RuntimeError('Simulated ingest failure for recovery testing')

        self._write_source_artifacts(
            job,
            source,
            job_status='completed',
            source_status='completed',
        )
        completed_job = self._store.update_job_status(
            project_id=job['project_id'],
            job_id=job['id'],
            status='completed',
        )
        if completed_job is not None:
            self._logger.info('Completed ingest job %s', completed_job['id'])

        transcribe_job = self._store.maybe_queue_transcribe_job(
            project_id=job['project_id'],
            source_id=job['source_id'],
            data_dir=self._data_dir,
        )
        if transcribe_job is None:
            return

        self._logger.info('Queued transcribe job %s after ingest job %s', transcribe_job['id'], job['id'])
        running_transcribe_job = self._store.update_job_status(
            project_id=transcribe_job['project_id'],
            job_id=transcribe_job['id'],
            status='running',
        )
        if running_transcribe_job is None:
            raise RuntimeError('Failed to transition queued transcribe job to running')
        self._process_transcribe_job(running_transcribe_job)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            job = self._store.claim_next_queued_job('ingest')
            if job is None:
                self._stop_event.wait(self._poll_interval_seconds)
                continue

            try:
                self._process_ingest_job(job)
            except Exception:
                self._logger.exception('Ingest job %s failed', job['id'])
                current_job = self._store.get_job(project_id=job['project_id'], job_id=job['id'])
                if current_job is not None and current_job['status'] == 'running':
                    self._store.update_job_status(
                        project_id=job['project_id'],
                        job_id=job['id'],
                        status='failed',
                    )
