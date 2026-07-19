interface Props {
  onBack: () => void;
}

export default function Privacy({ onBack }: Props) {
  return (
    <div className="content-page">
      <button className="ghost" onClick={onBack}>
        ← Back
      </button>

      <h1>About SprintDeck</h1>
      <p>
        SprintDeck is a free, real-time sprint estimation tool for agile teams. A moderator creates a
        room, shares a short code, and the team estimates backlog items together using Fibonacci
        story points. Votes stay hidden until everyone has voted, then the average is revealed —
        helping distributed teams reach consensus quickly across time zones.
      </p>

      <h2>How to run a SprintDeck session</h2>
      <ol>
        <li>The moderator creates a room and shares the room code or invite link.</li>
        <li>Team members join with their name — no sign-up required.</li>
        <li>The moderator queues stories/tickets and starts a round.</li>
        <li>Everyone privately picks a card; votes reveal together.</li>
        <li>Discuss outliers, re-vote if needed, then move to the next story.</li>
        <li>Export the results to text or Excel when finished.</li>
      </ol>

      <h1 id="privacy">Privacy Policy</h1>
      <p>
        <em>Last updated: 2026.</em>
      </p>
      <p>
        SprintDeck is designed to collect as little data as possible. We do not require accounts and
        do not ask for personal information beyond a display name you choose for a session.
      </p>

      <h2>Information we handle</h2>
      <ul>
        <li>
          <strong>Display name &amp; votes:</strong> The name you enter and the cards you pick are
          stored only for the lifetime of the session and are automatically deleted after the room
          expires.
        </li>
        <li>
          <strong>Local storage:</strong> Your browser stores your room identity locally so a
          refresh keeps you in the room. It never leaves your device except to identify you to the
          session.
        </li>
      </ul>

      <h2>Cookies and advertising</h2>
      <p>
        SprintDeck uses Google AdSense to display advertisements. Third-party vendors, including
        Google, use cookies to serve ads based on a user&rsquo;s prior visits to this and other
        websites. Google&rsquo;s use of advertising cookies enables it and its partners to serve ads
        to users based on their visit to SprintDeck and/or other sites on the Internet.
      </p>
      <p>
        You may opt out of personalised advertising by visiting{' '}
        <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
          Google Ads Settings
        </a>
        . For more information about how Google uses data, see{' '}
        <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
          Google&rsquo;s policies
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>For any questions about this policy, contact the site owner via rajeevstech.in.</p>
    </div>
  );
}
