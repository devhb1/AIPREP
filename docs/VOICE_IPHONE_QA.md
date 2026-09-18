# iPhone Safari voice QA matrix

Run on a physical iPhone (Safari) over HTTPS / Vercel preview.

| # | Check | Pass criteria |
|---|---|---|
| 1 | Mic permission | First Start prompt asks for mic; Allow works |
| 2 | User-gesture start | Start only after tap (no auto-connect) |
| 3 | Audio playback | Panel voice heard after handshake |
| 4 | Mute / unmute | Mic track toggles; UI reflects state |
| 5 | Transcript | Candidate + panel lines appear live |
| 6 | End → scorecard | End navigates to scorecard with dimensions |
| 7 | Language EN | Panel speaks English |
| 8 | Language HI | Panel speaks Hindi |
| 9 | Language Mix | Panel code-switches with candidate |
| 10 | Backgrounding | Leaving Safari may drop WebRTC — error recoverable |
| 11 | Lock screen | Session may pause; user can restart |
| 12 | Low bandwidth | Connecting state + clear failure message |
| 13 | Consent gate | Cannot start without consent checkbox |
| 14 | Voice budget | Cap in Settings blocks start with 429 message |
| 15 | PWA Add to Home | Standalone launch still reaches Interview hub |

Optional: set `VOICE_MODEL` to the best Realtime model available on the OpenAI project.
