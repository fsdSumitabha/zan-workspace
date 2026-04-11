Timestamp : 09/04/2026 15:00
**Built a Scalable Dark-Themed Sidebar Layout for CRM**

**Achievements**
I restructured my layout properly by moving the sidebar out of the root and into a dedicated operations layout, ensuring consistent navigation across all CRM pages. I implemented a clean flex-based structure with a fixed sidebar and scrollable content area. I also designed a modern dark-themed sidebar with improved active and hover states, making the UI feel more polished and cohesive. Overall, I now have a scalable foundation that aligns well with my multi-page CRM structure and supports future enhancements like collapsible menus and mobile responsiveness.

**Friction**
I initially placed the sidebar in the root layout, which caused layout and styling issues. I struggled with visual consistency, especially making the dark theme feel refined instead of harsh. The active state styling didn’t match the overall design, and spacing felt off without a proper layout wrapper. I also lacked clarity on where structural UI components should live, which slowed down progress until the layout hierarchy was corrected.

Timestamp : 09/04/2026 17:00
**Client Projects Pagination & Integration Progress**

**Technical Achievements**
I built a working client projects API and connected it to the frontend. I handled dynamic routing properly and fixed parameter access so data loads correctly. I implemented pagination on the frontend by fetching all projects once and slicing them per page. I also resolved data mismatch issues between API response and UI components by passing the correct structure. Finally, I reused an existing project preview card component, simplifying rendering and improving consistency across the interface.

**Friction & Challenges**
I initially struggled with route parameters not being available, which blocked API calls. There was confusion between server and client handling of params. The UI broke due to mismatched data structures between backend and components. Debugging was harder because the API call silently failed without logs. I also had to rethink pagination after realizing the backend didn’t support it, requiring a shift to frontend-based pagination logic.


Timestamp : 10/04/2026 14:00 
**Achievements**
I successfully upgraded my API to return both client details and their linked projects in a clean structure. I aligned my frontend to consume this response properly by separating client and project state. I also improved my UI by introducing a structured client details page with a dedicated projects section, using lightweight preview cards instead of heavy components. I now understand how to organize pages into list, overview, and detail levels, and how each route should serve a specific purpose in the overall flow.

**Friction**
I struggled initially with how to structure the API response and whether to embed or separate data. Mapping the response correctly in the frontend state caused confusion, especially around loading and null handling. I was also unsure about UI decisions—whether to reuse existing components or create new ones—and how much information to show at each level without cluttering the interface.


Timestamp : 10/04/2026 08:00 PM

/api/admin/operations -- API developed