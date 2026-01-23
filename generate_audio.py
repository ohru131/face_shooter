#!/usr/bin/env python3
"""
Generate Halloween-themed BGM and sound effects for the game
"""

import numpy as np
from scipy.io import wavfile
import os

# Create audio directory
audio_dir = "/home/ubuntu/face_shooter/client/public/audio"
os.makedirs(audio_dir, exist_ok=True)

SAMPLE_RATE = 44100

def generate_sine_wave(freq, duration, sample_rate=SAMPLE_RATE):
    """Generate a sine wave"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    return np.sin(2 * np.pi * freq * t)

def generate_square_wave(freq, duration, sample_rate=SAMPLE_RATE):
    """Generate a square wave"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    return np.sign(np.sin(2 * np.pi * freq * t))

def generate_sawtooth_wave(freq, duration, sample_rate=SAMPLE_RATE):
    """Generate a sawtooth wave"""
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    return 2 * (t * freq - np.floor(0.5 + t * freq))

def apply_envelope(audio, attack=0.01, decay=0.1, sustain=0.7, release=0.1):
    """Apply ADSR envelope"""
    length = len(audio)
    envelope = np.ones(length)
    
    attack_samples = int(attack * SAMPLE_RATE)
    decay_samples = int(decay * SAMPLE_RATE)
    release_samples = int(release * SAMPLE_RATE)
    sustain_samples = length - attack_samples - decay_samples - release_samples
    
    if sustain_samples < 0:
        sustain_samples = 0
    
    # Attack
    envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
    # Decay
    envelope[attack_samples:attack_samples+decay_samples] = np.linspace(1, sustain, decay_samples)
    # Sustain
    envelope[attack_samples+decay_samples:attack_samples+decay_samples+sustain_samples] = sustain
    # Release
    if release_samples > 0:
        envelope[-release_samples:] = np.linspace(sustain, 0, release_samples)
    
    return audio * envelope

def generate_halloween_bgm():
    """Generate a spooky Halloween BGM loop"""
    duration = 16  # 16 second loop
    
    # Minor key melody notes (A minor / D minor feel)
    melody_notes = [
        (220, 0.5), (196, 0.5), (175, 0.5), (165, 0.5),  # A3, G3, F3, E3
        (220, 0.5), (262, 0.5), (247, 0.5), (220, 0.5),  # A3, C4, B3, A3
        (175, 0.5), (165, 0.5), (147, 0.5), (165, 0.5),  # F3, E3, D3, E3
        (175, 0.5), (196, 0.5), (220, 0.5), (196, 0.5),  # F3, G3, A3, G3
    ]
    
    # Bass line
    bass_notes = [
        (55, 2), (44, 2), (49, 2), (55, 2),  # A1, F1, G1, A1
        (55, 2), (44, 2), (49, 2), (55, 2),
    ]
    
    audio = np.zeros(int(SAMPLE_RATE * duration))
    
    # Add melody
    time_pos = 0
    for freq, dur in melody_notes * 2:  # Repeat melody
        note = generate_sine_wave(freq, dur) * 0.3
        note = apply_envelope(note, attack=0.02, decay=0.1, sustain=0.5, release=0.1)
        start = int(time_pos * SAMPLE_RATE)
        end = start + len(note)
        if end <= len(audio):
            audio[start:end] += note
        time_pos += dur
    
    # Add bass
    time_pos = 0
    for freq, dur in bass_notes * 2:
        note = generate_sawtooth_wave(freq, dur) * 0.15
        note = apply_envelope(note, attack=0.05, decay=0.2, sustain=0.6, release=0.2)
        start = int(time_pos * SAMPLE_RATE)
        end = start + len(note)
        if end <= len(audio):
            audio[start:end] += note
        time_pos += dur
    
    # Add spooky pad (low drone)
    pad = generate_sine_wave(110, duration) * 0.1  # A2 drone
    pad += generate_sine_wave(165, duration) * 0.05  # E3 fifth
    audio += pad
    
    # Add some tremolo effect
    tremolo = 1 + 0.2 * np.sin(2 * np.pi * 4 * np.linspace(0, duration, len(audio)))
    audio *= tremolo
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.7
    
    return audio

def generate_magic_shoot_sound():
    """Generate a magical shooting sound"""
    duration = 0.15
    
    # Rising pitch with sparkle
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), False)
    freq = 600 + 800 * t / duration  # Rising from 600 to 1400 Hz
    audio = np.sin(2 * np.pi * freq * t) * 0.5
    
    # Add sparkle harmonics
    audio += np.sin(2 * np.pi * freq * 2 * t) * 0.2
    audio += np.sin(2 * np.pi * freq * 3 * t) * 0.1
    
    # Apply envelope
    envelope = np.exp(-3 * t / duration)
    audio *= envelope
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.6
    
    return audio

def generate_explosion_sound():
    """Generate an explosion/hit sound"""
    duration = 0.3
    
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), False)
    
    # Noise burst with falling pitch
    noise = np.random.uniform(-1, 1, len(t))
    freq = 200 * np.exp(-5 * t / duration)
    tone = np.sin(2 * np.pi * freq * t)
    
    audio = noise * 0.5 + tone * 0.5
    
    # Apply envelope
    envelope = np.exp(-4 * t / duration)
    audio *= envelope
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.7
    
    return audio

def generate_damage_sound():
    """Generate a damage/hurt sound"""
    duration = 0.2
    
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), False)
    
    # Descending tone
    freq = 400 - 200 * t / duration
    audio = generate_square_wave(200, duration) * 0.3
    audio += np.sin(2 * np.pi * freq * t) * 0.4
    
    # Apply envelope
    envelope = np.exp(-3 * t / duration)
    audio *= envelope
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.6
    
    return audio

def generate_powerup_sound():
    """Generate a magical powerup/heal sound"""
    duration = 0.4
    
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), False)
    
    # Ascending arpeggio effect
    audio = np.zeros(len(t))
    notes = [523, 659, 784, 1047]  # C5, E5, G5, C6
    note_duration = duration / len(notes)
    
    for i, freq in enumerate(notes):
        start = int(i * note_duration * SAMPLE_RATE)
        end = int((i + 1) * note_duration * SAMPLE_RATE)
        segment = np.sin(2 * np.pi * freq * t[start:end]) * 0.4
        segment += np.sin(2 * np.pi * freq * 2 * t[start:end]) * 0.2  # Harmonic
        audio[start:end] = segment * np.exp(-2 * np.linspace(0, 1, end-start))
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.6
    
    return audio

def generate_gameover_sound():
    """Generate a game over sound"""
    duration = 1.5
    
    t = np.linspace(0, duration, int(SAMPLE_RATE * duration), False)
    
    # Descending sad melody
    audio = np.zeros(len(t))
    notes = [(392, 0.3), (349, 0.3), (330, 0.3), (294, 0.6)]  # G4, F4, E4, D4
    
    time_pos = 0
    for freq, dur in notes:
        start = int(time_pos * SAMPLE_RATE)
        end = int((time_pos + dur) * SAMPLE_RATE)
        if end > len(audio):
            end = len(audio)
        segment_len = end - start
        segment_t = np.linspace(0, dur, segment_len, False)
        segment = np.sin(2 * np.pi * freq * segment_t) * 0.4
        sawtooth = 2 * (segment_t * (freq/2) - np.floor(0.5 + segment_t * (freq/2)))
        segment += sawtooth * 0.2
        envelope = np.exp(-2 * segment_t / dur)
        audio[start:end] = segment * envelope
        time_pos += dur
    
    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.6
    
    return audio

def save_wav(filename, audio):
    """Save audio as WAV file"""
    # Convert to 16-bit integer
    audio_int = (audio * 32767).astype(np.int16)
    wavfile.write(filename, SAMPLE_RATE, audio_int)
    print(f"Saved: {filename}")

# Generate and save all audio files
print("Generating Halloween BGM...")
bgm = generate_halloween_bgm()
save_wav(os.path.join(audio_dir, "bgm_halloween.wav"), bgm)

print("Generating sound effects...")
save_wav(os.path.join(audio_dir, "sfx_shoot.wav"), generate_magic_shoot_sound())
save_wav(os.path.join(audio_dir, "sfx_explosion.wav"), generate_explosion_sound())
save_wav(os.path.join(audio_dir, "sfx_damage.wav"), generate_damage_sound())
save_wav(os.path.join(audio_dir, "sfx_powerup.wav"), generate_powerup_sound())
save_wav(os.path.join(audio_dir, "sfx_gameover.wav"), generate_gameover_sound())

print("All audio files generated successfully!")
