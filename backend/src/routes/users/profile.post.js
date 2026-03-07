const { supabase } = require('../../supabase/client');

/**
 * @swagger
 * /api/users/profile:
 *   post:
 *     summary: Create or update user profile
 *     description: Saves onboarding data to Supabase
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               auth0_id:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               departure_airport:
 *                 type: string
 *               passport_country:
 *                 type: string
 *               passport_expiry_date:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
const handler = async (req, res) => {
	try {
		const {
			auth0_id,
			email,
			first_name,
			last_name,
			departure_airport,
			passport_country,
			passport_expiry_date,
			avatar_url,
		} = req.body;

		if (!auth0_id) {
			return res.status(400).json({ error: 'auth0_id is required' });
		}

		// Insert or update based on auth0_id (which is unique)
		const { data, error } = await supabase
			.from('user_profiles')
			.upsert(
				{
					auth0_id,
					...(email && { email }),
					first_name,
					last_name,
					departure_airport,
					passport_country,
					passport_expiry_date,
					avatar_url,
					updated_at: new Date().toISOString(),
				},
				{ onConflict: 'auth0_id' }
			)
			.select()
			.single();

		if (error) {
			console.error('Supabase error:', error);
			return res.status(500).json({ error: 'Failed to save profile' });
		}

		return res.status(200).json({ message: 'Profile saved successfully', data });
	} catch (error) {
		console.error('Profile save error:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
};

module.exports = {
	method: 'post',
	path: '/',
	handler,
};
