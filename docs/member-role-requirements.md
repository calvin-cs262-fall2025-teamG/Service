# Member and role requirements

Function availability below is based on the declarations in `Service/database.types.ts`. Those declarations show function names and arguments, but do not by themselves confirm authorization behavior. The database uses `communities` for the organizations described here.

These requirements are tested using member-roles.test.ts.

| Requirement | Database function | Is Enforced | 
|---|---|---|
| Only owners can delete communities | **Exists:** `delete_community(p_community_id)`. | Yes |
| Only owners can update the community | **Exists:** `update_community(p_community_id, p_data)`. | Yes |
| Owners can transfer ownership to another member or admin | **Exists:** `transfer_community_ownership(p_community_id, p_new_owner_id)`. `set_community_member_role` exists, but its declared signature does not establish that it also updates `communities.owner_id`. | Yes |
| Only owners can promote a member to admin | **Exists:** `set_community_member_role(p_community_id, p_user_id, p_role)`. | Yes |
| Only owners can demote an admin to member | **Exists:** `set_community_member_role(p_community_id, p_user_id, p_role)`. | Yes |
| Owners and admins can delete community messages | **Exists:** `delete_community_message(p_message_id)`. | Yes |
| Owners and admins can accept community members | **Exists:** `approve_community_member(p_community_id, p_user_id)`. | Yes |
| Owners and admins can update community member status | **Exists:** `approve_community_member(p_community_id, p_user_id)` and `decline_community_member(p_community_id, p_user_id)` cover acceptance and decline.| Yes |
| Owners and admins can remove community members | **Exists:** `remove_community_member(p_community_id, p_user_id)`. | Yes |
| Owners and admins can remove items from a community | **Exists:** `remove_community_item(p_community_id, p_item_id)` to authorize unlinking an item from a community. `update_item(p_item_id, p_data)` exists, but its signature does not establish this specific permission. | Yes |
| A declined member cannot be invited to a community | **Exists:** `invite_community_member(p_community_id, p_user_id)` to enforce the declined-member restriction. No invite function is declared. | Yes |
| A removed member becomes declined | **Exists:** `remove_community_member(p_community_id, p_user_id)`. Its signature exists; confirm its implementation sets the membership status to `declined`. | Yes |
| Only the owner can undecline a member | **Exists:** `set_community_member_status(p_community_id, p_user_id, p_status)` must restrict changing a declined status to the owner. No general member-status function is declared. | Yes |
