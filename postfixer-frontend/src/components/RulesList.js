import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Paper, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Select, MenuItem, FormControl, InputLabel, Box, IconButton, Grid, makeStyles, Tooltip } from '@material-ui/core';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import RemoveIcon from '@material-ui/icons/Remove';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';

const useStyles = makeStyles((theme) => ({
  table: {
    '& .MuiTableCell-root': {
      padding: '6px 16px',
    },
  },
  smallText: {
    fontSize: '0.875rem',
  },
}));

function RulesList({ rules: initialRules, onRulesChange }) {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    conditions: [{ key: '', condition: '', value: '' }],
    operators: [],
    action_type: '',
    action: '',
    custom_text: '',
    custom_number: '',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [customTextError, setCustomTextError] = useState('');
  const [keyOptions, setKeyOptions] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [rules, setRules] = useState([]);

  // Use useMemo to sort rules whenever they change
  const sortedRules = useMemo(() => {
    return [...rules].sort((a, b) => a.rule_id - b.rule_id);
  }, [rules]);

  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  useEffect(() => {
    // Fetch key options from the backend
    axios.get('http://localhost:8000/api/key_options')
      .then(response => {
        setKeyOptions(response.data);
      })
      .catch(error => {
        console.error('Error fetching key options:', error);
      });
  }, []);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleInputChange = (e, index) => {
    const { name, value } = e.target;
    setNewRule(prev => {
      const updated = { ...prev };
      
      if (name.startsWith('condition_')) {
        const [_, field, idx] = name.split('_');
        updated.conditions[idx][field] = value;
      } else if (name.startsWith('operator_')) {
        const idx = parseInt(name.split('_')[1]);
        updated.operators[idx] = value;
      } else {
        updated[name] = value;
      }
      
      if (name === 'action_type') {
        updated.action = '';
        updated.custom_number = '';
      }
      
      if (name === 'action') {
        if (value === '4NN' || value === '5NN') {
          updated.custom_number = '';
        } else if (value.match(/^[45][0-9]{2}$/)) {
          updated.custom_number = value.slice(1);
        } else {
          updated.custom_number = '';
        }
      }
      
      if (name === 'custom_text') {
        if (value.startsWith(' ')) {
          setCustomTextError('Custom text must not start with a space');
        } else {
          setCustomTextError('');
        }
      }
      
      if (name === 'custom_number') {
        const actionPrefix = updated.action.charAt(0);
        updated.action = actionPrefix + value;
      }
      
      return updated;
    });
  };

  const addCondition = () => {
    setNewRule(prev => ({
      ...prev,
      conditions: [...prev.conditions, { key: '', condition: '', value: '' }],
      operators: [...prev.operators, 'AND'],
    }));
  };

  const removeCondition = (index) => {
    setNewRule(prev => {
      const updatedConditions = prev.conditions.filter((_, i) => i !== index);
      const updatedOperators = prev.operators.filter((_, i) => i !== index - 1);
      return {
        ...prev,
        conditions: updatedConditions,
        operators: updatedOperators,
      };
    });
  };

  const handleSubmit = async () => {
    if (customTextError) {
      return; // Prevent submission if there are errors
    }
    try {
      const ruleToSubmit = { ...newRule };
      delete ruleToSubmit.custom_number; // Remove custom_number from the submitted data

      // Find the highest existing rule_id
      const highestId = Math.max(...sortedRules.map(rule => rule.rule_id), 0);
      
      // Assign the next available ID to the new rule
      ruleToSubmit.rule_id = highestId + 1;

      console.log('Submitting rule:', ruleToSubmit);
      await axios.post('http://localhost:8000/api/rules', ruleToSubmit);
      
      // Update the local state with the new rule
      setRules(prevRules => [...prevRules, ruleToSubmit]);
      
      onRulesChange();
      handleClose();
      
      // Reset the newRule state
      setNewRule({
        name: '',
        conditions: [{ key: '', condition: '', value: '' }],
        operators: [],
        action_type: '',
        action: '',
        custom_text: '',
        custom_number: '',
      });
    } catch (error) {
      console.error('Error submitting rule:', error.response?.data);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleEditOpen = (rule) => {
    const convertedRule = convertOldRuleFormat(rule);
    setEditingRule(convertedRule);
    setEditOpen(true);
  };

  const handleEditClose = () => {
    setEditingRule(null);
    setEditOpen(false);
  };

  const handleEditInputChange = (e, index) => {
    const { name, value } = e.target;
    setEditingRule(prev => {
      const updated = { ...prev };
      
      if (name.startsWith('condition_')) {
        const [_, field, idx] = name.split('_');
        updated.conditions[idx][field] = value;
      } else if (name.startsWith('operator_')) {
        const idx = parseInt(name.split('_')[1]);
        updated.operators[idx] = value;
      } else {
        updated[name] = value;
      }
      
      return updated;
    });
  };

  const addEditCondition = () => {
    setEditingRule(prev => ({
      ...prev,
      conditions: [...prev.conditions, { key: '', condition: '', value: '' }],
      operators: [...prev.operators, 'AND'],
    }));
  };

  const removeEditCondition = (index) => {
    setEditingRule(prev => {
      const updatedConditions = prev.conditions.filter((_, i) => i !== index);
      const updatedOperators = prev.operators.filter((_, i) => i !== index - 1);
      return {
        ...prev,
        conditions: updatedConditions,
        operators: updatedOperators,
      };
    });
  };

  const handleEditSubmit = async () => {
    try {
      await axios.put(`http://localhost:8000/api/rules/${editingRule.rule_id}`, editingRule);
      onRulesChange();
      handleEditClose();
    } catch (error) {
      console.error('Error updating rule:', error);
    }
  };

  const handleDelete = async (rule) => {
    try {
      await axios.delete(`http://localhost:8000/api/rules/${rule.rule_id}`);
      onRulesChange();
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  // Updated conditionOptions array
  const conditionOptions = ['exact', 'regex', 'wildcard'];
  const actionTypeOptions = ['ACCEPT', 'REJECT', 'OTHER'];

  const getActionOptions = (actionType) => {
    switch (actionType) {
      case 'ACCEPT':
        return ['OK'];
      case 'REJECT':
        return ['4NN', '5NN', 'REJECT', 'DEFER', 'DEFER_IF_REJECT', 'DEFER_IF_PERMIT'];
      case 'OTHER':
        return ['BCC', 'DISCARD', 'DUNNO', 'FILTER', 'HOLD'];
      default:
        return [];
    }
  };

  const getValuePlaceholder = (condition) => {
    switch (condition) {
      case 'exact':
        return 'e.g., example@domain.com';
      case 'regex':
        return 'e.g., ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
      case 'wildcard':
        return 'e.g., *@example.com';
      default:
        return '';
    }
  };

  // Generate numbers from 00 to 99 for the dropdown
  const numberOptions = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));

  // Helper function to convert old rule format to new format
  const convertOldRuleFormat = (rule) => {
    if (!rule.conditions) {
      return {
        ...rule,
        conditions: [
          {
            key: rule.key || '',
            condition: rule.condition || '',
            value: rule.value || '',
          }
        ],
        operators: []
      };
    }
    return rule;
  };

  const moveRule = async (ruleId, direction) => {
    try {
      const index = sortedRules.findIndex(rule => rule.rule_id === ruleId);
      let newPosition;

      if (direction === 'up' && index > 0) {
        newPosition = sortedRules[index - 1].rule_id;
      } else if (direction === 'down' && index < sortedRules.length - 1) {
        newPosition = sortedRules[index + 1].rule_id;
      } else {
        return; // Can't move further in this direction
      }

      await axios.put(`http://localhost:8000/api/rules/${ruleId}/move`, { new_position: newPosition });
      // Fetch updated rules after moving
      const response = await axios.get('http://localhost:8000/api/rules');
      setRules(response.data);
      onRulesChange(response.data);
    } catch (error) {
      console.error('Error moving rule:', error);
    }
  };

  const truncateText = (text, maxLength = 50) => {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
  };

  return (
    <Paper>
      <Box p={2}>
        <Grid container spacing={2} alignItems="center" justifyContent="center">
          <Grid item>
            <Typography variant="h6">Rules</Typography>
          </Grid>
          <Grid item>
            <Button 
              variant="outlined" 
              color="primary" 
              onClick={handleOpen}
            >
              Add Rule
            </Button>
          </Grid>
        </Grid>
      </Box>
      <TableContainer>
        <Table stickyHeader className={classes.table} size="small">
          <TableHead>
            <TableRow>
              <TableCell className={classes.smallText}>ID</TableCell>
              <TableCell className={classes.smallText}>Name</TableCell>
              <TableCell className={classes.smallText}>Conditions</TableCell>
              <TableCell className={classes.smallText}>Action Type</TableCell>
              <TableCell className={classes.smallText}>Action</TableCell>
              <TableCell className={classes.smallText}>Custom Text</TableCell>
              <TableCell className={classes.smallText}>Options</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRules
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((rule, index) => {
                const convertedRule = convertOldRuleFormat(rule);
                return (
                  <TableRow key={rule.rule_id}>
                    <TableCell className={classes.smallText}>{rule.rule_id}</TableCell>
                    <TableCell className={classes.smallText}>{convertedRule.name}</TableCell>
                    <TableCell className={classes.smallText}>
                      {convertedRule.conditions.map((condition, index) => (
                        <div key={index}>
                          {condition.key}: {condition.condition} {condition.value}
                          {index < convertedRule.conditions.length - 1 && (
                            <span> {convertedRule.operators[index]} </span>
                          )}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className={classes.smallText}>{convertedRule.action_type}</TableCell>
                    <TableCell className={classes.smallText}>{convertedRule.action}</TableCell>
                    <TableCell className={classes.smallText}>
                      <Tooltip title={convertedRule.custom_text || ''}>
                        <span>{truncateText(convertedRule.custom_text || '')}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={classes.smallText}>
                      <IconButton size="small" onClick={() => handleEditOpen(convertedRule)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(convertedRule)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => moveRule(rule.rule_id, 'up')} disabled={index === 0}>
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => moveRule(rule.rule_id, 'down')} disabled={index === sortedRules.length - 1}>
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={sortedRules.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Add New Rule</DialogTitle>
        <DialogContent>
          <TextField name="name" label="Name" fullWidth onChange={handleInputChange} margin="normal" />
          
          {newRule.conditions.map((condition, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <FormControl fullWidth margin="normal">
                  <InputLabel>Operator</InputLabel>
                  <Select name={`operator_${index - 1}`} value={newRule.operators[index - 1] || ''} onChange={handleInputChange}>
                    {['AND', 'OR', 'NAND', 'NOR'].map((op) => (
                      <MenuItem key={op} value={op}>{op}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Box mb={2}>
                <Typography variant="subtitle1">Condition {index + 1}</Typography>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Key</InputLabel>
                  <Select name={`condition_key_${index}`} value={condition.key} onChange={(e) => handleInputChange(e, index)}>
                    {keyOptions.map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                  <InputLabel>Condition</InputLabel>
                  <Select name={`condition_condition_${index}`} value={condition.condition} onChange={(e) => handleInputChange(e, index)}>
                    {conditionOptions.map((option) => (
                      <MenuItem key={option} value={option}>{option}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField 
                  name={`condition_value_${index}`}
                  label="Value" 
                  fullWidth 
                  value={condition.value}
                  onChange={(e) => handleInputChange(e, index)}
                  margin="normal" 
                  placeholder={getValuePlaceholder(condition.condition)}
                  InputLabelProps={{
                    shrink: true,
                  }}
                />
                {index > 0 && (
                  <IconButton onClick={() => removeCondition(index)}>
                    <RemoveIcon />
                  </IconButton>
                )}
              </Box>
            </React.Fragment>
          ))}
          
          {newRule.conditions.length < 10 && (
            <Button startIcon={<AddIcon />} onClick={addCondition}>
              Add Condition
            </Button>
          )}

          <FormControl fullWidth margin="normal">
            <InputLabel>Action Type</InputLabel>
            <Select name="action_type" value={newRule.action_type} onChange={handleInputChange}>
              {actionTypeOptions.map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth margin="normal">
            <InputLabel>Action</InputLabel>
            <Select name="action" value={newRule.action} onChange={handleInputChange} disabled={!newRule.action_type}>
              {getActionOptions(newRule.action_type).map((option) => (
                <MenuItem key={option} value={option}>{option}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {(newRule.action === '4NN' || newRule.action === '5NN' || newRule.action.match(/^[45][0-9]{2}$/)) && (
            <FormControl fullWidth margin="normal">
              <InputLabel>Custom Number</InputLabel>
              <Select
                name="custom_number"
                value={newRule.custom_number}
                onChange={handleInputChange}
              >
                {numberOptions.map((number) => (
                  <MenuItem key={number} value={number}>{number}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            name="custom_text"
            label="Custom Text"
            fullWidth
            multiline
            rows={4}
            value={newRule.custom_text}
            onChange={handleInputChange}
            margin="normal"
            error={!!customTextError}
            helperText={customTextError}
            InputLabelProps={{
              shrink: true,
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!!customTextError}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Rule Dialog */}
      <Dialog open={editOpen} onClose={handleEditClose}>
        <DialogTitle>Edit Rule</DialogTitle>
        <DialogContent>
          {editingRule && (
            <>
              <TextField name="name" label="Name" fullWidth value={editingRule.name} onChange={handleEditInputChange} margin="normal" />
              
              {editingRule.conditions.map((condition, index) => (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Operator</InputLabel>
                      <Select name={`operator_${index - 1}`} value={editingRule.operators[index - 1] || ''} onChange={handleEditInputChange}>
                        {['AND', 'OR', 'NAND', 'NOR'].map((op) => (
                          <MenuItem key={op} value={op}>{op}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <Box mb={2}>
                    <Typography variant="subtitle1">Condition {index + 1}</Typography>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Key</InputLabel>
                      <Select name={`condition_key_${index}`} value={condition.key} onChange={(e) => handleEditInputChange(e, index)}>
                        {keyOptions.map((option) => (
                          <MenuItem key={option} value={option}>{option}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Condition</InputLabel>
                      <Select name={`condition_condition_${index}`} value={condition.condition} onChange={(e) => handleEditInputChange(e, index)}>
                        {conditionOptions.map((option) => (
                          <MenuItem key={option} value={option}>{option}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField 
                      name={`condition_value_${index}`}
                      label="Value" 
                      fullWidth 
                      value={condition.value}
                      onChange={(e) => handleEditInputChange(e, index)}
                      margin="normal" 
                      placeholder={getValuePlaceholder(condition.condition)}
                      InputLabelProps={{
                        shrink: true,
                      }}
                    />
                    {index > 0 && (
                      <IconButton onClick={() => removeEditCondition(index)}>
                        <RemoveIcon />
                      </IconButton>
                    )}
                  </Box>
                </React.Fragment>
              ))}
              
              {editingRule.conditions.length < 10 && (
                <Button startIcon={<AddIcon />} onClick={addEditCondition}>
                  Add Condition
                </Button>
              )}

              <FormControl fullWidth margin="normal">
                <InputLabel>Action Type</InputLabel>
                <Select name="action_type" value={editingRule.action_type} onChange={handleEditInputChange}>
                  {actionTypeOptions.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth margin="normal">
                <InputLabel>Action</InputLabel>
                <Select name="action" value={editingRule.action} onChange={handleEditInputChange} disabled={!editingRule.action_type}>
                  {getActionOptions(editingRule.action_type).map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(editingRule.action === '4NN' || editingRule.action === '5NN' || editingRule.action.match(/^[45][0-9]{2}$/)) && (
                <FormControl fullWidth margin="normal">
                  <InputLabel>Custom Number</InputLabel>
                  <Select
                    name="custom_number"
                    value={editingRule.custom_number}
                    onChange={handleEditInputChange}
                  >
                    {numberOptions.map((number) => (
                      <MenuItem key={number} value={number}>{number}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                name="custom_text"
                label="Custom Text"
                fullWidth
                multiline
                rows={4}
                value={editingRule.custom_text}
                onChange={handleEditInputChange}
                margin="normal"
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleEditClose}>Cancel</Button>
          <Button onClick={handleEditSubmit}>Save Changes</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default RulesList;
