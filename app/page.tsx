import { getChatGPTUser } from './chatgpt-auth';
import { ProposalPortal } from './components/portal';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <ProposalPortal
      authenticatedUser={user ? { displayName: user.displayName, email: user.email } : null}
    />
  );
}
