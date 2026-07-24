interface Props {
  onBack: () => void;
  onTerms: () => void;
}

// Privacy Policy — written for SprintDeck's actual data practices and aware of
// the EU/UK GDPR and India's DPDP Act 2023. Have a lawyer review before relying
// on it commercially.
export default function Privacy({ onBack, onTerms }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1>About SprintDeck</h1>
      <p>
        SprintDeck is a free, real-time sprint estimation and retrospective tool for agile teams. A
        moderator creates a room, shares a short code or link, and the team estimates backlog items
        together using Fibonacci story points — votes stay hidden until everyone has voted, then the
        result is revealed. Teams can also run a Miro-style retrospective board.
      </p>

      <h2>How to run a SprintDeck session</h2>
      <ol>
        <li>The moderator creates a room and shares the room code or invite link.</li>
        <li>Team members join with a display name — no sign-up required.</li>
        <li>The moderator names the ticket and starts a voting round.</li>
        <li>Everyone privately picks a card; votes reveal together.</li>
        <li>Discuss outliers, re-vote if needed, then move to the next ticket.</li>
        <li>Export the results (text, CSV, Excel or PDF) when finished.</li>
      </ol>

      <h1 id="privacy">Privacy Policy</h1>
      <p>
        <em>Last updated: 24 July 2026.</em>
      </p>
      <p>
        SprintDeck (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is built to collect as little personal data
        as possible. We do not require accounts, passwords, or email addresses. This policy explains
        what we process, why, and your rights under the EU/UK General Data Protection Regulation
        (GDPR) and India&rsquo;s Digital Personal Data Protection Act, 2023 (DPDP Act).
      </p>

      <h2>Who is responsible</h2>
      <p>
        The operator of SprintDeck is the data controller (GDPR) / data fiduciary (DPDP Act) for the
        limited data described below. Contact us via <strong>rajeevstech.in</strong>.
      </p>

      <h2>What we process</h2>
      <ul>
        <li>
          <strong>Display name:</strong> the name you type when joining a session (choose a nickname
          if you prefer not to use your real name).
        </li>
        <li>
          <strong>Session content:</strong> the votes you cast, ticket names, and any notes/action
          items you add to a retrospective board. Please do not put confidential or personal
          information into notes or ticket names.
        </li>
        <li>
          <strong>Local storage on your device:</strong> a small identifier so a refresh keeps you in
          your room. It stays on your device and is sent only to identify you to that session.
        </li>
        <li>
          <strong>Technical logs:</strong> our hosting provider (Microsoft Azure) may record standard
          request data such as IP address and timestamps for security and reliability. We do not use
          these to profile you.
        </li>
      </ul>

      <h2>Why we process it (legal basis)</h2>
      <p>
        We process the above to provide the collaborative session you request and keep the service
        secure and working. Under the GDPR our legal bases are <em>performance of a service you ask
        for</em> and our <em>legitimate interest</em> in operating the tool; under the DPDP Act, the
        basis is your consent / the legitimate use of providing the service. Advertising cookies (if
        shown, see below) rely on your consent.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Session data is <strong>ephemeral</strong> and auto-deletes: planning-poker rooms expire
        after about 2 hours of inactivity (5 hours maximum), retrospective boards after about 4 hours
        of inactivity (8 hours maximum), and carried-over retrospective action items after about 90
        days. Data on your own device (local storage) remains until you clear it or leave the room.
      </p>

      <h2>Who we share it with (processors)</h2>
      <ul>
        <li>
          <strong>Microsoft Azure</strong> — hosting, real-time messaging (Web PubSub) and database
          (Cosmos DB) that store the transient session data.
        </li>
        <li>
          <strong>Google AdSense</strong> — advertising, if ads are enabled. Google and its partners
          may use cookies to serve ads based on prior visits. You can opt out of personalised ads at{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
            Google Ads Settings
          </a>{' '}
          and read Google&rsquo;s practices at{' '}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
            Google&rsquo;s policies
          </a>
          .
        </li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>International transfers</h2>
      <p>
        SprintDeck runs on Microsoft Azure and data may be processed in the region where the service
        is hosted, which may be outside your country. Where required, transfers rely on appropriate
        safeguards such as Standard Contractual Clauses.
      </p>

      <h2>Your rights</h2>
      <p>
        Because we hold so little data and it auto-deletes quickly, most requests resolve simply by
        leaving a session. You also have rights under law:
      </p>
      <ul>
        <li>
          <strong>GDPR (EEA/UK):</strong> access, rectification, erasure, restriction, objection,
          data portability, withdrawal of consent, and the right to lodge a complaint with your data
          protection authority.
        </li>
        <li>
          <strong>DPDP Act (India):</strong> access to and correction/erasure of your personal data,
          grievance redressal, and the right to nominate. You may withdraw consent at any time.
        </li>
      </ul>
      <p>To exercise any right or raise a grievance, contact us via rajeevstech.in.</p>

      <h2>Children</h2>
      <p>
        SprintDeck is a workplace tool intended for adults and is not directed at children. We do not
        knowingly collect data from children.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy; material changes will be reflected by the &ldquo;last updated&rdquo;
        date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or our{' '}
        <a
          href="/terms"
          onClick={(e) => {
            e.preventDefault();
            onTerms();
          }}
        >
          Terms of Service
        </a>
        ? Reach the site owner via rajeevstech.in.
      </p>
    </div>
  );
}
