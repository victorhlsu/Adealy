const { supabase } = require('../../supabase/client');

const handler = async (req, res) => {
	try {
		const { auth0_id } = req.query;

		if (!auth0_id) {
			return res.status(400).json({ error: 'auth0_id is required' });
		}

		const { data, error } = await supabase
			.from('user_profiles')
			.select('*')
			.eq('auth0_id', auth0_id)
			.maybeSingle();

		if (error) {
			console.error('Supabase error:', error);
			return res.status(500).json({ error: 'Database check failed' });
		}

		if (!data) {
			return res.status(404).json({ exists: false });
		}

		return res.status(200).json({ exists: true, data });
	} catch (error) {
		console.error('Profile fetch error:', error);
		return res.status(500).json({ error: 'Internal server error' });
	}
};

module.exports = {
	method: 'get',
	path: '/',
	handler,
};
