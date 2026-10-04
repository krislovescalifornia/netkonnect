export const setupSteps = [
  { label:'Companion', title:'Waking the tiny network crew', detail:'Starting your background companion and making sure it answers.' },
  { label:'Checkup', title:'A little preflight, a lot of peace of mind', detail:'Checking what is already ready so we only repair what needs help.' },
  { label:'Helper', title:'Giving our lookout its binoculars', detail:'Preparing detailed capture and local app protection. Approve the Windows Administrator prompt if it appears.' },
  { label:'Sign-in', title:'Packing for the next adventure', detail:'Enabling background collection when you sign in to Windows.' },
  { label:'Live data', title:'Waiting for the first little footprints', detail:'Verifying fresh connections, adapters, DNS clues and measured TCP / UDP capture.' },
  { label:'Journal', title:'Tucking the field notes safely away', detail:'Saving and checking your local history before calling everything ready.' }
];

export function progressView(progress, now = Date.now()) {
  const step = Math.max(1, Math.min(6, Number(progress?.step) || 1));
  const complete = progress?.state === 'complete', failed = progress?.state === 'error';
  const elapsed = Math.max(0, Math.floor((now - (progress?.startedAt ?? now)) / 1000));
  return { ...setupSteps[step - 1], step, complete, failed, elapsed,
    percent:complete ? 100 : Math.max(0, Math.min(83, Number(progress?.percent) || 0)),
    title:complete ? 'All aboard. Your observatory is ready!' : failed ? 'A little help before takeoff' : setupSteps[step - 1].title,
    detail:complete ? 'Live collection checked. Local journal saved. Tiny crew, big high-five.' : failed
      ? 'Your completed steps are safe. Follow the message below, then try the Easy Button again.' : setupSteps[step - 1].detail,
    waiting:!complete && !failed && elapsed >= 12
      ? step === 3 ? 'Still on this step. Windows may be waiting for your approval.'
        : step === 5 ? 'Still listening for live data. The crew is on lookout duty.'
        : 'Still working on this step. The crew has not wandered off.' : '' };
}
