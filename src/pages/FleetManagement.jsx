import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Car, Plus, Trash2, Hash, Info, CheckCircle2, XCircle, X, Truck, Pencil } from 'lucide-react';

export default function FleetManagement() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal & Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null); // Tracks if we are editing
  
  // Confirmation and Notification States
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

  const showToast = (message, isError = false) => {
    setNotification({ show: true, message, isError });
    setTimeout(() => setNotification({ show: false, message: '', isError: false }), 4000);
  };

  // --- OPEN MODALS ---
  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', type: 'Cargo Van', make: '', model: '', year: '', vin: '', license_plate: '' });
    setShowAddModal(true);
  };

  const openEditModal = (vehicle) => {
    setEditingId(vehicle.id);
    setFormData({
      name: vehicle.name || '',
      type: vehicle.type || 'Cargo Van',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || '',
      vin: vehicle.vin || '',
      license_plate: vehicle.license_plate || ''
    });
    setShowAddModal(true);
  };

  // --- SAVE/UPDATE VEHICLE LOGIC ---
  const triggerSaveConfirmation = (e) => {
    e.preventDefault(); 
    setConfirmAction({
      show: true,
      title: editingId ? 'Update Vehicle' : 'Confirm New Vehicle',
      message: editingId ? `Are you sure you want to update ${formData.name}?` : `Are you sure you want to add ${formData.name} to the fleet?`,
      isDelete: false,
      onConfirm: executeSaveVehicle
    });
  };

  const executeSaveVehicle = async () => {
    setConfirmAction({ show: false }); 
    setIsSubmitting(true);
    try {
      if (editingId) {
        // UPDATE existing vehicle
        const { data, error } = await supabase.from('vehicles').update(formData).eq('id', editingId).select().single();
        if (error) throw error;
        
        setVehicles(vehicles.map(v => v.id === editingId ? data : v).sort((a, b) => a.name.localeCompare(b.name)));
        showToast('Vehicle updated successfully!');
      } else {
        // INSERT new vehicle
        const { data, error } = await supabase.from('vehicles').insert([formData]).select().single();
        if (error) throw error;
        
        setVehicles([...vehicles, data].sort((a, b) => a.name.localeCompare(b.name)));
        showToast('Vehicle added to fleet successfully!');
      }
      
      setShowAddModal(false);
    } catch (error) {
      showToast(`Failed to save vehicle: ${error.message}`, true);
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
    setConfirmAction({ show: false }); 
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      
      setVehicles(vehicles.filter(v => v.id !== id));
      showToast('Vehicle removed from fleet.');
    } catch (error) {
      showToast(`Failed to delete vehicle: ${error.message}`, true);
    }
  };

  const filteredVehicles = vehicles.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (v.license_plate || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 relative">
      
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pb-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-md">
            <Truck size={28} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Fleet Management</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Add, track, and manage your delivery vehicles.</p>
          </div>
        </div>
        <button 
          onClick={openAddModal}
          className="px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center gap-2"
        >
          <Plus size={16} /> Add New Vehicle
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Search by Vehicle Name or License Plate..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-900 outline-none text-sm font-medium transition-all"
          />
        </div>
      </div>

      {/* Vehicles Table */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <div className="w-full h-14 bg-slate-50/80 border-b border-slate-200"></div>
          {[1,2,3,4,5].map(n => (
            <div key={n} className="w-full h-20 bg-white border-b border-slate-100 flex items-center px-6 gap-6 animate-pulse">
              <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0"></div>
              <div className="w-32 h-4 bg-slate-100 rounded shrink-0"></div>
              <div className="w-48 h-4 bg-slate-100 rounded shrink-0"></div>
              <div className="w-24 h-6 bg-slate-100 rounded-lg shrink-0 ml-auto"></div>
            </div>
          ))}
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-3xl border border-slate-200 shadow-sm mt-6">
          <Car size={56} strokeWidth={1} className="mx-auto text-slate-300 mb-5" />
          <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">No vehicles found</h3>
          <p className="text-slate-500 text-sm">Click the button above to add your first vehicle to the fleet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-x-auto mt-6">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold tracking-tight rounded-tl-3xl">Vehicle Profile</th>
                <th className="px-6 py-4 font-bold tracking-tight">Make / Model / Year</th>
                <th className="px-6 py-4 font-bold tracking-tight">License Plate</th>
                <th className="px-6 py-4 font-bold tracking-tight">VIN Number</th>
                <th className="px-6 py-4 font-bold tracking-tight text-right rounded-tr-3xl">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVehicles.map(vehicle => (
                <tr key={vehicle.id} className="hover:bg-slate-50 transition-colors group">
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-sm shrink-0">
                        <Car size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-base tracking-tight">{vehicle.name}</p>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{vehicle.type}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{vehicle.make} <span className="font-medium text-slate-600">{vehicle.model}</span></p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">{vehicle.year}</p>
                  </td>

                  <td className="px-6 py-4">
                    <span className="px-3 py-1.5 bg-slate-100 text-slate-900 font-bold font-mono tracking-wide rounded-lg border border-slate-200 shadow-sm">
                      {vehicle.license_plate}
                    </span>
                  </td>

                  <td className="px-6 py-4 font-mono text-xs font-medium text-slate-500">
                    {vehicle.vin || <span className="italic text-slate-400">N/A</span>}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => openEditModal(vehicle)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-blue-100"
                        title="Edit Vehicle"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        onClick={() => triggerDeleteConfirmation(vehicle.id, vehicle.name)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 rounded-xl transition-all shadow-sm border border-transparent hover:border-red-100"
                        title="Remove Vehicle"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- ADD / EDIT VEHICLE MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-slate-100 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {editingId ? <Pencil size={18}/> : <Truck size={18}/>} 
                {editingId ? 'Edit Vehicle' : 'Add New Vehicle'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-1.5 text-slate-400 hover:text-slate-900 bg-white border border-slate-200 rounded-full active:scale-95 transition-all"><X size={16} /></button>
            </div>
            
            <form onSubmit={triggerSaveConfirmation} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Vehicle Identity</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Display Name</label>
                    <input type="text" name="name" required placeholder="e.g. Van 1" value={formData.name} onChange={handleInputChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Vehicle Type</label>
                    <select name="type" required value={formData.type} onChange={handleInputChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold cursor-pointer transition-all">
                      <option value="Car">Car</option>
                      <option value="Cargo Van">Cargo Van</option>
                      <option value="Box Truck">Box Truck</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Make & Model</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Make</label>
                    <input type="text" name="make" required placeholder="e.g. Ford" value={formData.make} onChange={handleInputChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Model</label>
                    <input type="text" name="model" required placeholder="e.g. Transit" value={formData.model} onChange={handleInputChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">Registration & Specs</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Year</label>
                      <input type="number" name="year" required placeholder="e.g. 2022" value={formData.year} onChange={handleInputChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-medium transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">License Plate</label>
                      <div className="relative"><Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" name="license_plate" required placeholder="ABC-1234" value={formData.license_plate} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide transition-all" /></div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">VIN Number</label>
                    <div className="relative"><Info className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" name="vin" required placeholder="17-Character VIN" value={formData.vin} onChange={handleInputChange} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm font-bold font-mono tracking-wide transition-all" /></div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button type="button" onClick={() => setShowAddModal(false)} className="w-full py-3.5 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="w-full py-3.5 text-sm bg-slate-900 text-white font-bold rounded-xl flex justify-center gap-2 items-center shadow-md hover:bg-slate-800 active:scale-95 disabled:opacity-50 transition-all">
                  {isSubmitting ? 'Saving...' : (editingId ? <><Pencil size={16} /> Update Vehicle</> : <><Plus size={16} /> Save Vehicle</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONFIRMATION MODAL --- */}
      {confirmAction.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center border border-slate-100">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border shadow-sm ${confirmAction.isDelete ? 'bg-red-50 text-red-600 border-red-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
              {confirmAction.isDelete ? <Trash2 size={32} /> : <Car size={32} />}
            </div>
            <h4 className="text-xl font-bold text-slate-900 tracking-tight">{confirmAction.title}</h4>
            <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">{confirmAction.message}</p>
            <div className="flex gap-3 pt-5">
              <button onClick={() => setConfirmAction({ show: false })} className="w-full py-3 text-sm bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all">Cancel</button>
              <button onClick={confirmAction.onConfirm} className={`w-full py-3 text-sm text-white font-bold rounded-xl shadow-md active:scale-95 transition-all ${confirmAction.isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODERN TOAST NOTIFICATION --- */}
      {notification.show && (
        <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 z-[120] flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`p-1.5 rounded-full ${notification.isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            {notification.isError ? <XCircle size={18} strokeWidth={2.5} /> : <CheckCircle2 size={18} strokeWidth={2.5} />}
          </div>
          <p className="text-sm font-medium pr-2">{notification.message}</p>
        </div>
      )}

    </div>
  );
}