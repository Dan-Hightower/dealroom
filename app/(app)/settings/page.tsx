import * as React from "react";
import { Settings } from "@/components/settings";

export default function SettingsPage(): React.JSX.Element {
	// useSearchParams needs a boundary or the route bails out of prerendering.
	return (
		<React.Suspense fallback={null}>
			<Settings />
		</React.Suspense>
	);
}
