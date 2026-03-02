import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Car, Plus, Trash2, Hash, Info, CheckCircle2, XCircle, X, AlertCircle } from 'lucide-react';

export default function FleetManagement() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal & Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // NEW: Confirmation and Notification States
  const [confirmAction, setConfirmAction] = useState({ show: false, title: '', message: '', onConfirm: null, isDelete: false });
  const [notification, setNotification] = useState({ show: false, message: '', isError: false });
  
  const [formData, setFormData] = useState({
    name: '', type: 'Cargo Van', make: '', model: '', year: '', vin: '', license_plate: ''
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('vehicles').select('*').order('name', { ascending: true });
      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error('Error fetching vehicles:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'vin' || name === 'license_plate' ? value.toUpperCase() : value }));
  };

  // --- ADD VEHICLE LOGIC ---
  const triggerAddConfirmation = (e) => {
    e.preventDefault(); // Native form validation passes first, then we stop it to show our modal
    setConfirmAction({
      show: true,
      title: 'Confirm New Vehicle',
      message: `Are you sure you want to add ${formData.name} to the fleet?`,
      isDelete: false,
      onConfirm: executeAddVehicle
    });
  };

  const executeAddVehicle = async () => {
    setConfirmAction({ show: false }); // Close confirm modal
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.from('vehicles').insert([formData]).select().single();
      if (error) throw error;
      
      setVehicles([...vehicles, data].sort((a, b) => a.name.localeCompare(b.name)));
      setShowAddModal(false);
      setFormData({ name: '', type: 'Cargo Van', make: '', model: '', year: '', vin: '', license_plate: '' });
      setNotification({ show: true, isError: false, message: 'Vehicle added to fleet successfully!' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to add vehicle: ${error.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- DELETE VEHICLE LOGIC ---
  const triggerDeleteConfirmation = (id, name) => {
    setConfirmAction({
      show: true,
      title: 'Delete Vehicle?',
      message: `Are you sure you want to remove ${name} from your fleet? This action cannot be undone.`,
      isDelete: true,
      onConfirm: () => executeDeleteVehicle(id)
    });
  };

  const executeDeleteVehicle = async (id) => {
    setConfirmAction({ show: false }); // Close confirm modal
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      
      setVehicles(vehicles.filter(v => v.id !== id));
      setNotification({ show: true, isError: false, message: 'Vehicle removed from fleet.' });
    } catch (error) {
      setNotification({ show: true, isError: true, message: `Failed to delete vehicle: ${error.message}` });
    }
  };

  const filteredVehicles = vehicles.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (v.license_plate || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="text-slate-500 font-medium">Loading fleet data...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Fleet Management</h2>
          <p className="text-sm text-slate-500 mt-2">Add and manage your delivery vehicles.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2"
        >
          <Plus size={18} /> Add New Vehicle
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search by Vehicle Name or License Plate..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Vehicles Grid */}
      {filteredVehicles.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
          <Car size={48} strokeWidth={1.5} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">No vehicles found</h3>
          <p className="text-slate-500 text-sm">Click the button above to add your first vehicle.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVehicles.map(vehicle => (
            <div key={vehicle.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-6 flex flex-col relative group">
              
              <button 
                onClick={() => triggerDeleteConfirmation(vehicle.id, vehicle.name)}
                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                title="Remove Vehicle"
              >
                <Trash2 size={16} />
              </button>

              <div className="flex items-center gap-3 mb-5 pr-8">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
                  <Car size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{vehicle.name}</h3>
                  <p className="text-xs font-semibold text-slate-500">{vehicle.type}</p>
                </div>
              </div>

              <div className="space-y-3 mb-4 flex-1">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Make & Model</span>
                  <span className="font-bold text-slate-900">{vehicle.make} {vehicle.model}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Year</span>
                  <span className="font-bold text-slate-900">{vehicle.year}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">License Plate</span>
                  <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{vehicle.license_plate}</span>
                </div>
                <div className="flex flex-col text-sm pt-2 border-t border-slate-50">
                  <span className="text-slate-400 text-[10px] uppercase tracking-widest font-bold mb-0.5">VIN Number</span>
                  <span className="font-mono font-medium text-slate-700 break-all">{vehicle.vin}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- ADD VEHICLE MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">Add New Vehicle</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full"><X size={16} /></button>
            </div>
            
            <form onSubmit={triggerAddConfirmation} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Display Name</label>
                  <input type="text" name="name" required placeholder="e.g. Van 1" value={formData.name} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Type</label>
                  <select name="type" required value={formData.type} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium cursor-pointer">
                    <option value="Car">Car</option>
                    <option value="Cargo Van">Cargo Van</option>
                    <option value="Box Truck">Box Truck</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Make</label>
                  <input type="text" name="make" required placeholder="e.g. Ford" value={formData.make} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Model</label>
                  <input type="text" name="model" required placeholder="e.g. Transit" value={formData.model} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Year</label>
                  <input type="number" name="year" required placeholder="e.g. 2022" value={formData.year} onChange={handleInputChange} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">License Plate</label>
                  <div className="relative"><Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" name="license_plate" required placeholder="ABC-1234" value={formData.license_plate} onChange={handleInputChange} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide" /></div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">VIN Number</label>
                <div className="relative"><Info className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" name="vin" required placeholder="17-Character VIN" value={formData.vin} onChange={handleInputChange} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide" /></div>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center disabled:opacity-70">
                  {isSubmitting ? 'Saving...' : <><Plus size={18} /> Save Vehicle</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL (Z-Index 80 to sit above everything) --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.isDelete ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-900 border-slate-100'}`}>
              {confirmAction.isDelete ? <Trash2 size={32} /> : <Car size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button 
                onClick={() => setConfirmAction({ show: false })} 
                className="w-full py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
              >
                Cancel
              </button>
              <button 
                onClick={confirmAction.onConfirm} 
                className={`w-full py-3 text-white font-bold rounded-xl active:scale-95 transition-all shadow-md ${confirmAction.isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- NOTIFICATIONS --- */}
      {notification.show && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border ${notification.isError ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
              {notification.isError ? <XCircle size={32} /> : <CheckCircle2 size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{notification.isError ? 'Error' : 'Success'}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium">{notification.message}</p>
            <button onClick={() => setNotification({ show: false, message: '', isError: false })} className="w-full mt-5 py-3.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all">Okay</button>
          </div>
        </div>
      )}
    </div>
  );
}