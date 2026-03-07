const { supabase } = require('../../supabase/client');

/**
 * POST /api/rooms/invite
 * Owner-only: invite a registered user by email into a room.
 */
const handler = async (req, res) => {
    const { room_id, email, auth0_id } = req.body || {};

    if (!room_id || !email || !auth0_id) {
        return res.status(400).json({ error: 'room_id, email, and auth0_id are required.' });
    }

    try {
        // 1. Verify the requester is the owner of the room
        const { data: member, error: memberError } = await supabase
            .from('room_members')
            .select('role')
            .eq('room_id', room_id)
            .eq('user_id', auth0_id)
            .single();

        if (memberError || !member || member.role !== 'owner') {
            return res.status(403).json({ error: 'Only the room owner can invite members.' });
        }

        // 2. Look up the invited user by email
        const { data: invitedUser, error: lookupError } = await supabase
            .from('user_profiles')
            .select('auth0_id, first_name, email')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (lookupError || !invitedUser) {
            return res.status(404).json({ error: 'No user found with that email. They must create an Adealy account first.' });
        }

        if (invitedUser.auth0_id === auth0_id) {
            return res.status(400).json({ error: 'You cannot invite yourself.' });
        }

        // 3. Add the user to room_members (ignore if already a member)
        const { error: insertError } = await supabase
            .from('room_members')
            .upsert({
                room_id,
                user_id: invitedUser.auth0_id,
                role: 'member',
                can_prompt_ai: true,
            }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });

        if (insertError) {
            console.error('Insert error:', insertError);
            return res.status(500).json({ error: 'Failed to add member.' });
        }

        return res.status(200).json({
            success: true,
            message: `${invitedUser.first_name || email} has been added to the room.`,
        });

    } catch (err) {
        console.error('Invite error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

module.exports = { handler, method: 'post' };
