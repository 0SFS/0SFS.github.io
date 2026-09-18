# Brainstorm: the iPhone fullscreen popup

Working notes, in the open. Not a spec — the shipped copy lives in
[`src/remote/fullscreenMessage.tsx`](../../src/remote/fullscreenMessage.tsx),
which is a plain text file to edit without touching any logic.

## What was wrong with my last three drafts

1. **Verbose.** Six paragraphs of prose in a popup on a phone. Nobody reads that
   while holding an aircraft.
2. **Diplomatic.** "The worry Apple cites…", "the risk is real" — I was writing
   Apple's press release inside this project's own UI.
3. **Lawyerly.** I dodged "monopoly" because of how the word behaves in a
   courtroom. Nobody asked for a legal filing. This is a protest notice on a
   free flight simulator.

The owner's instruction: state what is true in plain words, take a side, and
make the reader understand that the project and the pilot are on the same side
of this.

## "Practical monopoly" — is it a legal term?

No. There is no cause of action called "practical monopoly". Legal terms of art
are "monopoly power", "monopolization" (Sherman Act §2), "dominant position"
(EU), "gatekeeper" (DMA), "Strategic Market Status" (UK DMCCA). "Practical
monopoly" is ordinary English meaning *in practice, there is only one option*.

Which is precisely why it is the right phrase, and safer than the alternatives:

- It is an observation, not a legal conclusion. Nobody has to win a case for it
  to be true.
- It is checkable by the reader in five seconds: try to install something on
  your iPhone that did not come from the App Store.
- It concedes nothing. Saying "Apple has a practical monopoly on iOS app
  distribution" does not require the legal finding, and it cannot be answered by
  "a court said otherwise", because no court ruled on that sentence.

So: say it. Plainly, in the copy.

## The reality I was ignoring

Sideloading on iOS exists on paper — enterprise certificates, TestFlight, EU
alternative marketplaces since iOS 17.4, EU iPadOS since the DMA reached it.
None of that describes how anybody actually gets software onto an iPhone. For
practically every iPhone owner on earth, the App Store is the only door. Writing
around that with "outside the EU…" was technically true and materially useless.
The copy should say what is true for the person reading it.

## The argument, in four lines

1. Fullscreen is a standard web feature. Apple ships it on Mac and iPad, and
   withholds it from web pages on iPhone.
2. Apple controls, in practice, every route for installing software on iOS and
   iPadOS, and takes 15–30% of what sells through it.
3. A web page that cannot fill the screen cannot be a serious game or tool, so
   the developer of a free web thing is pushed toward shipping a paid app — the
   one channel Apple taxes.
4. Apple's own defence in court is that developers do not need the App Store
   because they can reach users through the web. Apple decides whether the web
   is usable. It decided no.

Keep step 4. It is not lawyerly, it is the smoking gun: the same company says
"the web is the alternative" to a judge and "the web may not have the screen" to
the phone in your hand.

## Tone decisions

- **Title is a dig, and names the cause.** The owner's line is the model:
  *"Apple blocks fullscreen websites on iOS so they can take a cut when you are
  pushed into paying for an app."* Keep that shape: actor, act, motive.
- **We are both the victim.** The notice says *we* did not do this to you. That
  is the difference between a nag and a protest.
- **Recommend against the iPhone.** The owner wants that said. It is a real
  recommendation, not just spite: on any other device this software has the
  whole screen. Phrase it as a recommendation with a reason attached, because a
  recommendation with a reason is what a reader can act on and forward, and an
  insult they simply screenshot. Keep the contempt for the platform and the
  company, not for the person holding the phone — they are the one being
  overcharged, and they are reading it on the device they already own.
- **Profanity: out.** Not out of politeness — out of usefulness. This popup gets
  screenshotted and posted; the version that travels is the one nobody can
  dismiss as a crank. The owner's own fury is better served by lines that get
  quoted.

## Facts, and how dated they are

Keep these checkable. If the copy is revised, re-check the dated ones.

| Claim | Status |
| --- | --- |
| Fullscreen API unsupported for pages in iPhone Safari; video only | Current; detected at runtime, not assumed |
| Safari on macOS and iPadOS grants it to pages | Current |
| App Store commission 15–30% | Current |
| Games ≈70% of App Store revenue | Apple's own figures via *Epic v. Apple* (2021) |
| Every iOS browser must use WebKit | App Store rule 2.5.6; EU-only exception since iOS 17.4 (2024) |
| Home Screen web apps announced for removal in the EU, then reversed | Feb–Mar 2024 |
| Alternative app stores on iPadOS | EU only, after DMA designation (2024) |
| Judge found wilful violation of the App Store injunction, criminal contempt referral | Apr 2025, *Epic v. Apple* |

## Why a separate file

The owner should be able to rewrite every word of this without reading a line of
React. `fullscreenMessage.tsx` holds nothing but the strings and the markup they
sit in; the popup component imports it. Edit it, reload, done.
