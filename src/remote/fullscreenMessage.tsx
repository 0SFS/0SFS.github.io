/**
 * THE WORDS. Edit this file freely — it holds nothing but text and the tags it
 * sits in. No logic, no state, nothing that can break the controller. The popup
 * that shows it is `PhoneFullscreenPrompt.tsx`, and the reasoning behind the
 * wording is in `docs/brainstorm/iphone-fullscreen-popup.md`.
 *
 * Every factual claim here is checkable, which is not caution — it is what
 * makes it repeatable. This notice gets screenshotted; the version that travels
 * is the one nobody can wave away.
 */

/** The iPhone popup's headline: who did it, what they did, and why. */
export const FULLSCREEN_BLOCKED_TITLE =
  'Apple blocks fullscreen websites on iPhone so they get a cut when you are pushed into paying for an app.'

/** The question on a browser that can actually do it. */
export const FULLSCREEN_OFFER_TITLE = 'Hide the browser bars for a bigger controller?'
export const FULLSCREEN_DECLINED_TITLE = 'The browser declined fullscreen.'

/** What the pilot loses, and whose doing it is. Shown above the options. */
export function FullscreenBlockedIntro() {
  return <p className="phone-popup__detail">
    This controller is built to use your whole screen. Safari keeps about an eighth of it for bars
    you cannot hide, and the bottom one sits under the thumb that works the brake. We did not do this
    to you and we cannot fix it from here: fullscreen is a standard part of the web, Apple ships it
    in Safari on the Mac and on the iPad, and refuses it to web pages on the iPhone. Apple has a
    practical monopoly on getting software onto this device — nobody installs anything here that did
    not come from the App Store — and it takes 15–30% of everything sold there. A website that could
    fill your screen would be a game, a tool, or this controller, and it would owe Apple nothing.
    That is the whole reason. Your options:
  </p>
}

/** The three things that actually exist, best first. */
export function FullscreenBlockedOptions() {
  return <ol className="phone-popup__options">
    <li>
      <strong>Add it to your Home Screen.</strong> <em>Share → Add to Home Screen.</em> The same
      page, opening without the bars. No App Store, no account, no download, nothing installed you
      cannot delete by holding an icon. Ten seconds, and this notice never comes back.
    </li>
    <li>
      <strong>Fly in the browser anyway.</strong> Every control works. You lose the screen the bars
      take, and that is the whole cost.
    </li>
    <li>
      <strong>Next time, buy a phone that is yours.</strong> Android, a laptop, an iPad — one tap,
      whole screen, no permission needed. An iPhone is the only device in that list where the
      manufacturer decides what a web page may do, and switching browsers will not help you: Apple
      requires every browser on iOS to be Safari underneath. This project is free software and it
      runs everywhere. Apple is the only vendor on that list that charges you for the privilege of
      being told no.
    </li>
  </ol>
}

/** The case, folded away. Four short steps, each one closing an excuse. */
export function FullscreenBlockedCase() {
  return <details className="phone-popup__why">
    <summary>The full story</summary>
    <p>
      <strong>They have it and they are keeping it from you.</strong> Safari's own engine implements
      fullscreen — it is how video goes full-bleed on this very phone — and Safari hands it to whole
      pages on the Mac and the iPad. This controller does not guess at your device; it asks, and
      iPhone Safari answers <code>fullscreenEnabled: false</code>. Same standard, same engine, one
      device singled out.
    </p>
    <p>
      <strong>The safety excuse is not serious.</strong> The line is that a page owning your screen
      could impersonate the system and trap you. Every other browser settled that years ago with a
      prompt, a notice and an escape gesture — and your iPhone already has that gesture, because it
      is how you leave any full-screen App Store app. If it were really dangerous, it would be
      dangerous on the iPad too.
    </p>
    <p>
      <strong>Follow the money.</strong> Games are about 70% of App Store revenue, by Apple's own
      figures disclosed in <em>Epic v. Apple</em>. A game or a tool that cannot fill the screen is
      not a serious game or tool, so the developer of a free website is pushed into shipping a paid
      app — through the only store on the device, at Apple's rate. Break the free thing until the
      paid thing is the only way to make it good. You end up paying for software that was already
      free, and Apple takes its share of that.
    </p>
    <p>
      <strong>They have already admitted the game.</strong> Apple's own answer to antitrust claims is
      that developers are not trapped in the App Store, because they can always reach people through
      the web. That argument only works if the web is a real alternative — and Apple is the one who
      decides whether it is. You cannot tell a court the web is the way out while making sure the web
      cannot use the screen.
    </p>
    <p>
      <strong>Nothing here was given freely.</strong> Rival browser engines arrived on iOS only when
      EU law forced them, and only in the EU. Other app stores reached the iPad only when that law
      reached iPadOS. The same release that carried the first of those concessions also announced
      that Home Screen web apps — the workaround this notice is recommending — would stop working in
      the EU, reversed only once the European Commission asked why. In 2025 a US federal judge found
      Apple had wilfully violated her own App Store ruling and referred the company for criminal
      contempt. This is not a company that forgot about fullscreen.
    </p>
    <p>
      Put this on your Home Screen and the bars are gone. It is the one door Apple has left open, and
      the controller will stop mentioning any of this the moment you use it.
    </p>
  </details>
}
