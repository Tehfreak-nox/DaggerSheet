import { back } from '../app/nav';
import { Page } from '../ui/kit';

export function About() {
  return (
    <div className="s">
      <Page title="About" onClose={back}>
        <section className="stack-10 prose">
          <p>
            DaggerSheet is a fan-made, mobile-first character sheet for Daggerheart: create characters, roll Duality Dice,
            track Hope, Stress, Hit Points, armor, gold, items and domain cards, rest, and level up.
          </p>
          <h2 className="s-label">License</h2>
          <p>
            This product includes materials from the Daggerheart System Reference Document 2.0, © Critical Role, LLC,
            under the terms of the Darrington Press Community Gaming (DPCGL) License. More information can be found
            at <a href="https://www.daggerheart.com" target="_blank" rel="noreferrer">daggerheart.com</a>. There are no previous modifications by others.
          </p>
          <p className="s-muted">
            Daggerheart and Darrington Press are trademarks of Critical Role, LLC. DaggerSheet is not published, endorsed
            or specifically approved by Critical Role or Darrington Press.
          </p>
          <h2 className="s-label">Your data</h2>
          <p>
            Characters are saved in this browser on this device; nobody else can read them. Use Export and Import on the
            home screen to back them up or move them to another device. (Opened from claude.ai while signed in, they're
            also saved privately to your account there.)
          </p>
        </section>
      </Page>
    </div>
  );
}
