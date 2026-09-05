from datetime import datetime, timedelta
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from display_state.privacy import augury_clean, sanitize_current_work
from display_state.log_snapshot import recent_agent_work, build_augury_items


def test_private_context_is_not_a_secret():
    text = 'token usage: 123 password reset required /home/brian/src/state.js {"output":"tests passed"}'
    assert augury_clean(text) == text
    assert 'a' * 64 in augury_clean('commit ' + 'a' * 64)


@pytest.mark.parametrize('value', [
    'api_key="private-value"', '{"password":"private-value"}',
    'Authorization: Bearer private-value', 'Cookie: session=private-value; other=value',
    'https://example.test/?sig=private-value&mode=view',
    'https://example.test/?X-Amz-Signature=private-value',
    '-----BEGIN PRIVATE KEY-----\nprivate-value\n-----END PRIVATE KEY-----',
])
def test_credentials_are_redacted_before_truncation(value):
    assert 'private-value' not in augury_clean(value)
    assert '[redacted]' in augury_clean(value)
    assert augury_clean('api_key=' + 'a' * 90, 24) == '[redacted]'


def test_expired_observation_does_not_claim_completion():
    work = sanitize_current_work({'active': True, 'age_seconds': 999})
    assert work['active'] is False  # No fresh active evidence, not proof of idle.
    assert 'unknown' in work['summary']
    assert 'No active turn' not in work['summary']


def test_silent_old_request_does_not_claim_completion(tmp_path):
    stamp = (datetime.now() - timedelta(minutes=8)).strftime('%Y-%m-%d %H:%M:%S')
    log = tmp_path / 'agent.log'
    log.write_text(f'{stamp} INFO [session1] conversation turn: session=session1 platform=cli msg="run a long tool"\n')
    work = recent_agent_work(log)
    assert 'complete' not in work['summary'].lower()
    assert 'unknown' in work['detail'].lower()


def test_multiline_key_is_removed_before_log_lines_are_split():
    stamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    text = (f'{stamp} INFO tool terminal completed -----BEGIN PRIVATE KEY-----\n'
            f'{stamp} INFO tool terminal completed private-key-material\n'
            f'{stamp} INFO tool terminal completed -----END PRIVATE KEY-----\n'
            f'{stamp} INFO tool read_file completed /tmp/result.txt\n')
    items = build_augury_items(text, 12, 30)
    rendered = str(items)
    assert 'private-key-material' not in rendered
    assert '/tmp/result.txt' in rendered
