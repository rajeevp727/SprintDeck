interface Props {
  onBack: () => void;
  onPrivacy: () => void;
}

// Terms of Service — a plain, accurate baseline for a free, no-account tool.
// Have a lawyer review before relying on it commercially.
export default function Terms({ onBack, onPrivacy }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1>Terms of Service</h1>
      <p>
        <em>Last updated: 24 July 2026.</em>
      </p>
      <p>
        These terms govern your use of SprintDeck (the &ldquo;Service&rdquo;). By using the Service
        you agree to them. If you do not agree, please do not use SprintDeck.
      </p>

      <h2>The service</h2>
      <p>
        SprintDeck is a free, real-time sprint estimation and retrospective tool. It requires no
        account — you join a session with a display name and a room code or link. The Service is
        provided for team collaboration purposes.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use SprintDeck for any unlawful purpose or to infringe others&rsquo; rights.</li>
        <li>
          Do not post unlawful, abusive, or infringing content, and do not enter confidential or
          personal data of others into ticket names, notes, or action items.
        </li>
        <li>
          Do not attempt to disrupt, overload, reverse-engineer, or gain unauthorised access to the
          Service or its infrastructure.
        </li>
        <li>Do not use automated means to abuse room creation or messaging.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You are responsible for the display names, votes, ticket names, and notes you submit. This
        content is transient and auto-deletes with the session (see the{' '}
        <a
          href="/privacy"
          onClick={(e) => {
            e.preventDefault();
            onPrivacy();
          }}
        >
          Privacy Policy
        </a>
        ). You retain ownership of your content; you grant us the limited permission needed to
        display it to session participants and operate the Service.
      </p>

      <h2>Availability &amp; changes</h2>
      <p>
        SprintDeck is a free service offered on a best-effort basis with no guaranteed uptime or
        service levels. We may change, suspend, or discontinue any part of the Service, and may show
        advertisements, at any time without notice.
      </p>

      <h2>No warranty</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties
        of any kind, express or implied, including fitness for a particular purpose and
        non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or
        that data will be retained.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, SprintDeck and its operator will not be liable for any
        indirect, incidental, or consequential damages, or for any loss of data, profits, or
        goodwill, arising from your use of (or inability to use) the Service. As a free service, our
        total liability is limited to the amount you paid to use it — which is zero.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The SprintDeck application, name, and design are the property of its operator. These terms do
        not grant you any right to our trademarks or software beyond using the Service as intended.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts of India will have jurisdiction,
        without prejudice to any mandatory consumer protections available to you in your country of
        residence.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms? Reach the site owner via rajeevstech.in.</p>
    </div>
  );
}
